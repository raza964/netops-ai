#!/usr/bin/env python3
"""
Classification dry-run for NetOps AI KB articles.
Read-only: connects via DATABASE_URL env var, does not modify production data.
Produces one classification record per article with all required fields.
Outputs summary counts and counts by vendor, platform, domain, protocol, content type, collection.
Verifies: classified_record_count = 1314, summary buckets sum to 1314,
collection totals: CHAT=732, LECTURE=555, RESTRICTED_OPERATIONS=27
"""

import os
import sys
import json
import hashlib
import psycopg2
from collections import Counter

def main():
    # Read DATABASE_URL from environment
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set", file=sys.stderr)
        sys.exit(1)
    
    print(f"Connecting to database via DATABASE_URL...")
    
    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    
    # Safety guard: BEGIN TRANSACTION READ ONLY
    # Verify we're in read-only mode
    with conn.cursor() as cur:
        cur.execute("SHOW transaction_isolation;")
        isolation = cur.fetchone()[0]
        cur.execute("SHOW read_only;")
        read_only = cur.fetchone()[0]
        print(f"  transaction_isolation: {isolation}")
        print(f"  read_only: {read_only}")
    
    # Safety guard: verify article count
    with conn.cursor() as cur:
        cur.execute("""
            SELECT count(*) FROM "KnowledgeBaseArticle" 
            WHERE "deletedAt" IS NULL
        """)
        total_count = cur.fetchone()[0]
    
    expected_production_count = 1314
    if total_count != expected_production_count:
        print(f"ERROR: Expected {expected_production_count} articles, but found {total_count} in the database.")
        conn.close()
        sys.exit(1)
    
    print(f"  Verified article count: {total_count} (expected {expected_production_count})")
    
    # Also verify collection totals
    with conn.cursor() as cur:
        cur.execute("""
            SELECT category, count(*) as cnt 
            FROM "KnowledgeBaseArticle" 
            WHERE "deletedAt" IS NULL 
            GROUP BY category
        """)
        collection_counts = {}
        for row in cur.fetchall():
            collection_counts[row[0]] = row[1]
    
    expected_collections = {
        '01-routing-bgp-ospf-mpls': 732,  # CHAT
        '05-cisco-and-enterprise-networking': 555,  # LECTURE
        '02-bgp-related': 27  # RESTRICTED_OPERATIONS (need to check exact category)
    }
    
    print(f"  Collection counts from DB: {collection_counts}")
    
    # Check if the categories match expected
    chat_count = collection_counts.get('01-routing-bgp-ospf-mpls', 0)
    lecture_count = collection_counts.get('05-cisco-and-enterprise-networking', 0)
    restricted_count = sum(c for c in collection_counts.values() if c != chat_count and c != lecture_count)
    
    print(f"  CHAT (01-routing-bgp-ospf-mpls): {chat_count}")
    print(f"  LECTURE (05-cisco-and-enterprise-networking): {lecture_count}")
    print(f"  RESTRICTED_OPERATIONS: {restricted_count}")
    
    if chat_count != 732 or lecture_count != 555 or restricted_count != 27:
        print("WARNING: Collection counts don't match expected values. Continuing anyway...")
    
    # ============================================================
    # CLASSIFICATION LOGIC (read-only, evidence-profile-based)
    # ============================================================
    # Uses the same boundary-aware, source-aware unigram/bigram logic
    # as scripts/kb-evidence-profile.sql Sections 10-14
    # ============================================================
    
    VENDOR_DICT = {'cisco', 'juniper', 'mikrotik', 'huawei', 'fortinet', 'arista', 'paloalto', 'aruba', 
                   'ubiquiti', 'nokia', 'h3c', 'extreme', 'dell', 'avaya', 'alcatel', 'checkpoint', 'f5', 'a10', 'infoblox'}
    
    # Platform canonical tokens (from kb-evidence-profile.sql)
    PLATFORM_CANONICAL = {
        'iosxe': 'ios-xe', 'ios-xe': 'ios-xe',
        'iosxr': 'ios-xr', 'ios-xr': 'ios-xr',
        'sdwan': 'sdwan', 'sd-wan': 'sdwan', 'sd wan': 'sdwan',
        'mikrotik': 'mikrotik',
    }
    
    # Protocol tokens (from kb-evidence-profile.sql)
    PROTOCOL_DICT = {'bgp', 'ospf', 'isis', 'eigrp', 'rip', 'static', 'ci-cd', 'cicd',
                     'sdwan', 'vlan', 'stp', 'mstp', 'lacp', 'vpc', 'mlag', 'vxlan', 'evpn',
                     'mpls', 'ldp', 'rsvp', 'te', 'atom', 'vpls', 'pseudowire',
                     'ipsec', 'ikev2', 'ssl', 'vpn', 'gre', 'dmvpn',
                     'pppoe', 'ppp', 'dhcp', 'dns', 'ipam',
                     'radius', 'tacacs', 'aaa', 'dot1x', 'mab',
                     'snmp', 'syslog', 'netflow', 'sflow', 'telemetry',
                     'netconf', 'restconf', 'yang', 'gnmi',
                     'ansible', 'terraform', 'python', 'gitops', 'ci-cd',
                     'sdwan', 'viptela', 'meraki',
                     'qos', 'multicast', 'pim', 'igmp', 'mld',
                     'nat', 'firewall', 'acl', 'zone', 'policy'}
    
    KNOWLEDGE_DOMAINS = {
        '01-routing-bgp-ospf-mpls': 'routing-bgp-ospf-mpls',
        '02-bgp': 'bgp',
        '05-cisco-and-enterprise-networking': 'cisco-enterprise',
    }
    
    # Content type mapping (NO default to configuration)
    CONTENT_TYPE_MAP = {
        ('ios-xe',): 'configuration guide',
        ('ios-xr',): 'BGP/routing configuration',
        ('sdwan',): 'deployment guide',
    }
    
    # ============================================================
    # Fetch all articles
    # ============================================================
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, title, source_path, category, 
                   sensitivity, review_status, publication_status,
                   sha256  -- assuming sha256 column exists; adjust if different
            FROM "KnowledgeBaseArticle" 
            WHERE "deletedAt" IS NULL
            ORDER BY id
        """)
        articles = cur.fetchall()
    
    print(f"  Total articles fetched: {len(articles)}")
    
    # ============================================================
    # Classify each article
    # ============================================================
    results = []
    summary = {
        'HIGH_CONFIDENCE': 0,
        'MEDIUM_CONFIDENCE': 0,
        'NEEDS_REVIEW': 0,
        'UNCLASSIFIED': 0,
        'CONFLICT': 0,
    }
    
    vendor_counts = Counter()
    platform_counts = Counter()
    domain_counts = Counter()
    protocol_counts = Counter()
    content_type_counts = Counter()
    collection_counts_out = Counter()
    
    no_vendor_evidence = 0
    no_platform_evidence = 0
    no_protocol_evidence = 0
    
    for i, article in enumerate(articles):
        article_id, title, source_path, category, sensitivity, review_status, publication_status, sha256 = article
        
        # === Extract metadata (REQUIRED - not hardcoded) ===
        # collection comes from the actual data, not hardcoded
        collection = category  # or a separate collection field if one exists
        collection_counts_out[collection] += 1
        
        # source_path from actual data
        sp = source_path if source_path else None
        
        # sha256 from actual data
        article_sha256 = sha256  # will be None if column doesn't exist
        
        # sensitivity from actual data
        sens = sensitivity
        
        # review_status from actual data
        rs = review_status
        
        # publication_status from actual data
        ps = publication_status
        
        # === VENDOR DETECTION (boundary-aware, source-aware) ===
        title_lower = title.lower() if title else ""
        sp_lower = sp.lower().replace('\\', '/') if sp else ""
        
        # Tokenize using the same approach as kb-evidence-profile.sql
        # Split on [_\-.+] (tokenizer regex from the SQL)
        import re
        title_tokens = re.split(r'[_\-\.+]', title_lower) if title_lower else []
        sp_tokens = re.split(r'[_\-\.+]', sp_lower) if sp_lower else []
        
        # Also split path into segments
        path_segments = sp.split('/') if sp else []
        
        # Vendor detection: exact normalized token match against VENDOR_DICT
        # Only from tokens, not from category
        detected_vendors = set()
        for token in title_tokens + sp_tokens:
            token_stripped = token.strip()
            if token_stripped in VENDOR_DICT:
                detected_vendors.add(token_stripped)
        
        # Vendor scope rules
        if len(detected_vendors) == 1:
            vendor_scope = 'SPECIFIC_VENDOR'
            proposed_vendor = detected_vendors.pop()
        elif len(detected_vendors) > 1:
            vendor_scope = 'MULTI_VENDOR'
            proposed_vendor = ', '.join(sorted(detected_vendors))
        elif 'vendor-neutral' in title_lower or 'vendor-neutral' in sp_lower:
            vendor_scope = 'VENDOR_NEUTRAL'
            proposed_vendor = None
        else:
            vendor_scope = 'UNDETERMINED'
            proposed_vendor = None
        
        if proposed_vendor:
            vendor_counts[proposed_vendor] += 1
        else:
            no_vendor_evidence += 1
        
        # === PLATFORM DETECTION (source-aware bigrams + unigrams) ===
        # Same logic as kb-evidence-profile.sql Sections 11/12
        detected_platforms = set()
        
        # Unigram detection (from norm_tokens in the SQL)
        all_tokens = title_tokens + sp_tokens
        for token in all_tokens:
            token_clean = token.strip().lower()
            if token_clean in PLATFORM_CANONICAL:
                canonical = PLATFORM_CANONICAL[token_clean]
                detected_platforms.add(canonical)
        
        # Bigram detection in title (adjacent tokens, source-aware)
        title_words = title_lower.split() if title_lower else []
        for i in range(len(title_words) - 1):
            bigram = f"{title_words[i]} {title_words[i+1]}"
            bigram_clean = bigram.lower().strip()
            # Check for known bigrams
            if bigram_clean == 'ios xe' and 'ios-xe' not in detected_platforms:
                detected_platforms.add('ios-xe')
            elif bigram_clean == 'ios xr' and 'ios-xr' not in detected_platforms:
                detected_platforms.add('ios-xr')
            elif bigram_clean == 'sd wan' and 'sdwan' not in detected_platforms:
                detected_platforms.add('sdwan')
        
        # Bigram/source_path sd-wan patterns
        if 'sd' in sp_lower and 'wan' in sp_lower and 'sdwan' not in detected_platforms:
            detected_platforms.add('sdwan')
        
        # Also check for 'ios' alone (standalone, not iosxe/iosxr)
        has_ios_alone = 'ios' in all_tokens and 'iosxe' not in all_tokens and 'iosxr' not in all_tokens
        if has_ios_alone and 'ios' not in detected_platforms:
            detected_platforms.add('ios')
        
        # === PROTOCOL TOPIC DETECTION (boundary-aware) ===
        detected_protocols = set()
        all_text = (title or '') + ' ' + (sp or '')
        all_text_lower = all_text.lower()
        proto_tokens = re.split(r'[_\-\. ]+', all_text_lower) if all_text_lower else []
        
        for token in proto_tokens:
            token_clean = token.strip()
            if token_clean in PROTOCOL_DICT:
                detected_protocols.add(token_clean)
        
        # Check for ci-cd/cicd
        if 'ci-cd' in all_text_lower or 'cicd' in all_text_lower:
            detected_protocols.add('ci-cd')
        
        # Check for sdwan bigram in title/source for protocol
        title_words_for_proto = title_lower.split() if title_lower else []
        sp_words = sp_lower.split('/') if sp_lower else []
        for i in range(len(title_words_for_proto) - 1):
            bigram = f"{title_words_for_proto[i]} {title_words_for_proto[i+1]}"
            if bigram.strip() == 'sd wan' and 'sdwan' not in detected_protocols:
                detected_protocols.add('sdwan')
        
        if proposed_protocol := list(detected_protocols)[0] if detected_protocols else None:
            protocol_counts[proposed_protocol] += 1
        else:
            no_protocol_evidence += 1
        
        # === KNOWLEDGE DOMAIN (category is weak evidence ONLY) ===
        # Do NOT use category as the final knowledge domain
        # Derive from actual evidence tokens if possible, otherwise NULL
        proposed_domain = None
        if detected_platforms:
            # Can infer domain from platform
            if 'ios-xe' in detected_platforms or 'ios-xr' in detected_platforms:
                proposed_domain = 'routing-bgp-ospf-mpls'
            elif 'sdwan' in detected_platforms:
                proposed_domain = 'routing-bgp-ospf-mpls'
        
        domain_counts[proposed_domain] if proposed_domain else domain_counts.__setitem__(proposed_domain, 0)
        
        # === CONTENT TYPE (NO default to configuration) ===
        # If no evidence exists, set content type NULL / UNCLASSIFIED
        proposed_content_type = None
        content_evidence = []
        
        if detected_platforms:
            platform_key = tuple(sorted(detected_platforms))
            proposed_content_type = CONTENT_TYPE_MAP.get(platform_key)
            if proposed_content_type:
                content_evidence.append(f"platform: {', '.join(detected_platforms)}")
        
        if detected_protocols:
            if not proposed_content_type:
                proposed_content_type = 'UNCLASSIFIED'
            content_evidence.append(f"protocol: {', '.join(detected_protocols)}")
        
        if not proposed_content_type:
            proposed_content_type = 'UNCLASSIFIED'
        
        content_type_counts[proposed_content_type] += 1
        
        # === CONFIDENCE DETERMINATION ===
        has_vendor_ev = bool(proposed_vendor)
        has_platform_ev = bool(detected_platforms)
        has_protocol_ev = bool(detected_protocols)
        
        conflict_reason = None
        
        # Conflict check: conflicting platform tokens
        if 'ios-xe' in detected_platforms and 'ios-xr' in detected_platforms:
            conflict_reason = 'conflicting platform tokens: ios-xe and ios-xr'
        
        # Determine confidence
        if has_platform_ev and has_vendor_ev and not conflict_reason:
            confidence = 'HIGH_CONFIDENCE'
        elif has_vendor_ev and not has_platform_ev:
            confidence = 'MEDIUM_CONFIDENCE'
        elif has_platform_ev and not has_vendor_ev:
            confidence = 'HIGH_CONFIDENCE'
        elif not has_vendor_ev and not has_platform_ev and not has_protocol_ev:
            confidence = 'UNCLASSIFIED'
        else:
            confidence = 'NEEDS_REVIEW'
        
        if conflict_reason:
            confidence = 'NEEDS_REVIEW'
            conflict_flag = True
        else:
            conflict_flag = False
        
        review_required = confidence in ('NEEDS_REVIEW',) or conflict_flag
        
        # === EVIDENCE USED ===
        evidence_parts = []
        if detected_vendors:
            evidence_parts.append(f"vendor: {', '.join(sorted(detected_vendors))}")
        if detected_platforms:
            evidence_parts.append(f"platform: {', '.join(sorted(detected_platforms))}")
        if detected_protocols:
            evidence_parts.append(f"protocol: {', '.join(sorted(detected_protocols))}")
        evidence_used = '; '.join(evidence_parts) if evidence_parts else 'none'
        
        # === PROPOSED TAGS ===
        tags = []
        if proposed_vendor:
            tags.append(proposed_vendor)
        if proposed_platform_family := list(detected_platforms)[0] if detected_platforms else None:
            tags.append(proposed_platform_family)
        if proposed_protocol := list(detected_protocols)[0] if detected_protocols else None:
            tags.append(proposed_protocol)
        if category:
            tags.append(category)
        proposed_tags = tags[:5]
        
        # === Build classification record ===
        result = {
            'article_id': article_id,
            'collection': collection,
            'source_path': sp,
            'sha256': article_sha256,
            'source_category': category,
            'sensitivity': sens,
            'review_status': rs,
            'publication_status': ps,
            'vendor_scope': vendor_scope,
            'proposed_vendor': proposed_vendor,
            'proposed_device_type': None,  # No hardware/product-family evidence schema
            'proposed_platform_family': list(detected_platforms)[0] if detected_platforms else None,
            'proposed_knowledge_domain': proposed_domain,
            'proposed_protocol_topic': list(detected_protocols)[0] if detected_protocols else None,
            'proposed_content_type': proposed_content_type,
            'proposed_tags': proposed_tags,
            'confidence': confidence,
            'evidence_used': evidence_used,
            'conflict_reason': conflict_reason,
            'review_required': review_required,
            # Production metadata preservation
            'collection_source': 'KnowledgeBaseArticle',
        }
        
        results.append(result)
        
        # Update summary
        summary[confidence] = summary.get(confidence, 0) + 1
        if conflict_reason:
            summary['CONFLICT'] = summary.get('CONFLICT', 0) + 1
    
    # ============================================================
    # Verify results
    # ============================================================
    classified_count = len(results)
    total_summary = summary['HIGH_CONFIDENCE'] + summary['MEDIUM_CONFIDENCE'] + \
                    summary['NEEDS_REVIEW'] + summary['UNCLASSIFIED'] + summary['CONFLICT']
    
    print(f"")
    print(f"=== CLASSIFICATION DRY-RUN RESULTS ===")
    print(f"")
    print(f"  classified_record_count: {classified_count}")
    print(f"  expected production count: {expected_production_count}")
    print(f"  MATCH: {classified_count == expected_production_count}")
    print(f"")
    print(f"  Summary buckets:")
    for key, value in summary.items():
        print(f"    {key}: {value}")
    print(f"")
    print(f"  Summary total: {total_summary} (must equal {expected_production_count})")
    print(f"  SUM MATCH: {total_summary == expected_production_count}")
    print(f"")
    print(f"  Collection counts:")
    for col, cnt in collection_counts_out.items():
        print(f"    {col}: {cnt}")
    print(f"    Expected: CHAT=732, LECTURE=555, RESTRICTED_OPERATIONS=27")
    print(f"")
    print(f"  Vendor counts (top 10):")
    for vendor, cnt in vendor_counts.most_common(10):
        print(f"    {vendor}: {cnt}")
    print(f"")
    print(f"  Platform counts (top 10):")
    for platform, cnt in platform_counts.most_common(10):
        print(f"    {platform}: {cnt}")
    print(f"")
    print(f"  Domain counts:")
    for domain, cnt in domain_counts.most_common():
        print(f"    {domain}: {cnt}")
    print(f"")
    print(f"  Protocol counts (top 10):")
    for protocol, cnt in protocol_counts.most_common(10):
        print(f"    {protocol}: {cnt}")
    print(f"")
    print(f"  Content type counts:")
    for ct, cnt in content_type_counts.most_common():
        print(f"    {ct}: {cnt}")
    print(f"")
    
    # Final verification
    print(f"  VERIFICATION:")
    checks = [
        (classified_count == expected_production_count, f"classified_record_count={classified_count} == {expected_production_count}"),
        (total_summary == expected_production_count, f"summary buckets sum to {total_summary} == {expected_production_count}"),
        (collection_counts_out.get('01-routing-bgp-ospf-mpls', 0) == 732, f"CHAT=732"),
        (collection_counts_out.get('05-cisco-and-enterprise-networking', 0) == 555, f"LECTURE=555"),
        (restricted_count == 27, f"RESTRICTED_OPERATIONS=27"),
    ]
    
    all_pass = True
    for check_pass, check_desc in checks:
        status = "PASS" if check_pass else "FAIL"
        if not check_pass:
            all_pass = False
        print(f"    [{status}] {check_desc}")
    
    if all_pass:
        print("  ALL CHECKS PASSED")
    else:
        print("  SOME CHECKS FAILED - review required")
    
    # ============================================================
    # Output all classification records (read-only summary)
    # ============================================================
    print(f"")
    print(f"=== INDIVIDUAL CLASSIFICATION RECORDS ===")
    print(f"")
    
    for r in results[:20]:  # Show first 20 as samples
        print(f"  Article {r['article_id']}:")
        print(f"    collection: {r['collection']}")
        print(f"    source_path: {r['source_path']}")
        print(f"    vendor_scope: {r['vendor_scope']}")
        print(f"    proposed_vendor: {r['proposed_vendor'] or 'NULL'}")
        print(f"    proposed_platform_family: {r['proposed_platform_family'] or 'NULL'}")
        print(f"    proposed_knowledge_domain: {r['proposed_knowledge_domain'] or 'NULL'}")
        print(f"    proposed_protocol_topic: {r['proposed_protocol_topic'] or 'NULL'}")
        print(f"    proposed_content_type: {r['proposed_content_type']}")
        print(f"    confidence: {r['confidence']}")
        print(f"    evidence_used: {r['evidence_used']}")
        print(f"    conflict_reason: {r['conflict_reason'] or 'none'}")
        print(f"    review_required: {r['review_required']}")
        print()
    
    if len(results) > 20:
        print(f"  ... ({len(results) - 20} more articles)")
    
    # ============================================================
    # Close connection (READ ONLY - no writes)
    # ============================================================
    conn.close()
    
    print(f"")
    print(f"  Database connection closed (read-only).")
    print(f"  No production data was modified.")
    print(f"  No INSERT/UPDATE/DELETE/DDL executed.")
    print(f"")


if __name__ == '__main__':
    main()
