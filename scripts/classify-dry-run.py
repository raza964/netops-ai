#!/usr/bin/env python3
"""
Classification dry-run for NetOps AI KB articles.
Read-only: connects via DATABASE_URL env var, does not modify production data.
Uses the same regex evidence extraction as kb-evidence-profile.sql.
Verifies collection totals: CHAT=732, LECTURE=555, RESTRICTED_OPERATIONS=27
"""

import os
import sys
import re
import psycopg2
from collections import Counter

# Clean domain dictionary (NOT derived from legacy category)
DOMAIN_DICT = {
    'Routing': 'Routing',
    'Switching': 'Switching', 
    'MPLS': 'MPLS',
    'VPN': 'VPN',
    'Security': 'Security',
    'Wireless': 'Wireless',
    'GPON/FTTH': 'GPON/FTTH',
    'Network Management': 'Network Management',
    'AAA': 'AAA',
    'QoS': 'QoS',
    'IPv6': 'IPv6',
    'Data Center': 'Data Center',
    'Virtualization': 'Virtualization',
    'Systems': 'Systems',
    'Automation': 'Automation',
    'Cloud/DevOps': 'Cloud/DevOps',
}

def extract_metadata(content):
    """Extract metadata from article content using the same regex logic as kb-evidence-profile.sql."""
    if not content:
        return {
            'source_path': None,
            'category': None,
            'sensitivity': None,
            'review_status': None,
            'publication_status': None,
            'sha256': None,
        }
    
    # Extract source_path using same regex as kb-evidence-profile.sql
    sp_match = re.search(r"source_path:\s*([^\r\n]+)", content)
    source_path = sp_match.group(1).strip() if sp_match else None
    
    # Extract category using same regex
    cat_match = re.search(r"category:\s*([^\r\n]+)", content)
    category = cat_match.group(1).strip() if cat_match else None
    
    # Extract sensitivity - using pattern similar to other fields
    sens_match = re.search(r"sensitivity:\s*([^\r\n]+)", content)
    sensitivity = sens_match.group(1).strip() if sens_match else None
    
    # Extract review_status
    rs_match = re.search(r"review_status:\s*([^\r\n]+)", content)
    review_status = rs_match.group(1).strip() if rs_match else None
    
    # Extract publication_status
    ps_match = re.search(r"publication_status:\s*([^\r\n]+)", content)
    publication_status = ps_match.group(1).strip() if ps_match else None
    
    # Extract sha256
    sha_match = re.search(r"sha256:\s*([^\r\n]+)", content)
    sha256 = sha_match.group(1).strip() if sha_match else None
    
    return {
        'source_path': source_path,
        'category': category,
        'sensitivity': sensitivity,
        'review_status': review_status,
        'publication_status': publication_status,
        'sha256': sha256,
    }

def classify_domain(platform_tokens):
    """Determine knowledge domain from platform evidence, NOT from legacy category."""
    if not platform_tokens:
        return None
    
    # Derive domain from platform evidence tokens
    detected = set(platform_tokens)
    
    if 'ios-xe' in detected or 'ios-xr' in detected or 'sdwan' in detected:
        return 'Routing'  # Routing, Switching, MPLS
    elif detected:
        # Check for specific domain indicators in platform tokens
        for token in detected:
            if token in DOMAIN_DICT:
                return DOMAIN_DICT[token]
    
    return None  # Insufficient evidence

def classify_content_type(platform_tokens):
    """Determine content type from platform evidence. NULL if insufficient."""
    if not platform_tokens:
        return None
    
    detected = set(platform_tokens)
    
    if 'ios-xe' in detected:
        return 'configuration guide'
    elif 'ios-xr' in detected:
        return 'BGP/routing configuration'
    elif 'sdwan' in detected:
        return 'deployment guide'
    
    return None  # No evidence → NULL, not "configuration" default

def classify_vendor_scope(detected_vendors):
    """Vendor scope rules per spec."""
    if len(detected_vendors) == 1:
        return 'SPECIFIC_VENDOR', detected_vendors[0]
    elif len(detected_vendors) > 1:
        return 'MULTI_VENDOR', ', '.join(sorted(detected_vendors))
    elif 'vendor-neutral' in ' '.join(detected_vendors) if detected_vendors else '':
        return 'VENDOR_NEUTRAL', None
    else:
        return 'UNDETERMINED', None

def main():
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set", file=sys.stderr)
        sys.exit(1)
    
    print(f"Connecting to database via DATABASE_URL...")
    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    
    # ============================================================
    # Enforce true read-only transaction
    # ============================================================
    with conn.cursor() as cur:
        cur.execute("BEGIN TRANSACTION READ ONLY;")
        cur.execute("SHOW transaction_read_only;")
        is_read_only = cur.fetchone()[0]
        if not str(is_read_only).lower().startswith('on'):
            print(f"ERROR: transaction_read_only is not enabled (got: {is_read_only})")
            conn.rollback()
            sys.exit(1)
        print(f"  transaction_read_only is ON")
    
    # ============================================================
    # Fetch all articles and extract metadata
    # ============================================================
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, title, content
            FROM "KnowledgeBaseArticle"
            WHERE "deletedAt" IS NULL
            ORDER BY id
        """)
        articles = cur.fetchall()
    
    fetched_count = len(articles)
    print(f"  Fetched records: {fetched_count}")
    
    if fetched_count != 1314:
        print(f"ERROR: Expected 1314 records, but fetched {fetched_count}")
        conn.rollback()
        sys.exit(1)
    
    print(f"  Verified: fetched records = 1314")
    
    # ============================================================
    # Extract metadata from each article content
    # ============================================================
    extracted = []
    for article_id, title, content in articles:
        meta = extract_metadata(content)
        extracted.append({
            'article_id': article_id,
            'title': title,
            'source_path': meta['source_path'],
            'category': meta['category'],  # Legacy, NOT used as collection
            'sensitivity': meta['sensitivity'],
            'review_status': meta['review_status'],
            'publication_status': meta['publication_status'],
            'sha256': meta['sha256'],
        })
    
    # ============================================================
    # Verify collection totals from source_path metadata
    # ============================================================
    # Collection derived from source_path lvl1/lvl2, NOT from category
    chat_count = 0
    lecture_count = 0
    restricted_count = 0
    
    for item in extracted:
        sp = item['source_path']
        if sp:
            # Derive collection from source_path structure
            # Per earlier analysis: lvl1 = knowledge-base, lvl2 = chat-knowledge/lecture-data/restricted-operations
            parts = sp.replace('\\', '/').split('/')
            if len(parts) >= 2:
                lvl2 = parts[1] if len(parts) > 1 else ''
                if lvl2 == 'chat-knowledge':
                    chat_count += 1
                elif lvl2 == 'lecture-data':
                    lecture_count += 1
                elif lvl2 == 'restricted-operations':
                    restricted_count += 1
    
    print(f"  Collection from source_path metadata:")
    print(f"    CHAT (chat-knowledge): {chat_count}")
    print(f"    LECTURE (lecture-data): {lecture_count}")
    print(f"    RESTRICTED_OPERATIONS (restricted-operations): {restricted_count}")
    
    if chat_count != 732:
        print(f"ERROR: CHAT count expected 732, got {chat_count}")
        conn.rollback()
        sys.exit(1)
    if lecture_count != 555:
        print(f"ERROR: LECTURE count expected 555, got {lecture_count}")
        conn.rollback()
        sys.exit(1)
    if restricted_count != 27:
        print(f"ERROR: RESTRICTED_OPERATIONS count expected 27, got {restricted_count}")
        conn.rollback()
        sys.exit(1)
    
    print(f"  Verified: collection totals exactly 732/555/27")
    
    # ============================================================
    # Classify each article using boundary-aware logic
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
    
    for item in extracted:
        article_id = item['article_id']
        title = item['title']
        sp = item['source_path']
        category = item['category']  # Legacy, weak evidence only
        
        # === Tokenize using same regex as kb-evidence-profile.sql ===
        # Tokenizer splits on [_\-.+]
        title_lower = title.lower() if title else ""
        
        # Split title on [_\-.+]
        title_tokens = re.split(r'[_\-\.+]', title_lower) if title_lower else []
        
        # Split source_path on [_\-.+] 
        sp_tokens = []
        if sp:
            sp_lower = sp.replace('\\', '/').lower()
            sp_tokens = re.split(r'[_\-\.+]', sp_lower)
        
        # Also get path segments for platform detection
        path_segments = sp.replace('\\', '/').split('/') if sp else []
        
        # === VENDOR DETECTION ===
        VENDOR_DICT = {'cisco', 'juniper', 'mikrotik', 'huawei', 'fortinet', 'arista', 'paloalto', 'aruba', 
                       'ubiquiti', 'nokia', 'h3c', 'extreme', 'dell', 'avaya', 'alcatel', 'checkpoint', 'f5', 'a10', 'infoblox'}
        
        detected_vendors = set()
        for token in title_tokens + sp_tokens:
            token_stripped = token.strip()
            if token_stripped in VENDOR_DICT:
                detected_vendors.add(token_stripped)
        
        vendor_scope, proposed_vendor = classify_vendor_scope(detected_vendors)
        if proposed_vendor:
            vendor_counts[proposed_vendor] += 1
        
        # === PLATFORM DETECTION (boundary-aware, source-aware) ===
        PLATFORM_CANONICAL = {
            'iosxe': 'ios-xe', 'ios-xe': 'ios-xe',
            'iosxr': 'ios-xr', 'ios-xr': 'ios-xr',
            'sdwan': 'sdwan', 'sd-wan': 'sdwan', 'sd wan': 'sdwan',
            'mikrotik': 'mikrotik',
        }
        
        detected_platforms = set()
        
        # Unigram detection
        all_tokens = title_tokens + sp_tokens
        for token in all_tokens:
            token_clean = token.strip().lower()
            if token_clean in PLATFORM_CANONICAL:
                detected_platforms.add(PLATFORM_CANONICAL[token_clean])
        
        # Bigram detection in title
        title_words = title_lower.split() if title_lower else []
        for i in range(len(title_words) - 1):
            bigram = f"{title_words[i]} {title_words[i+1]}"
            bigram_clean = bigram.strip().lower()
            if bigram_clean == 'ios xe' and 'ios-xe' not in detected_platforms:
                detected_platforms.add('ios-xe')
            elif bigram_clean == 'ios xr' and 'ios-xr' not in detected_platforms:
                detected_platforms.add('ios-xr')
            elif bigram_clean == 'sd wan' and 'sdwan' not in detected_platforms:
                detected_platforms.add('sdwan')
        
        # Source_path sd-wan patterns
        if sp and 'sd' in sp.lower() and 'wan' in sp.lower() and 'sdwan' not in detected_platforms:
            detected_platforms.add('sdwan')
        
        # Standalone ios (not iosxe/iosxr)
        has_ios_alone = 'ios' in all_tokens and 'iosxe' not in all_tokens and 'iosxr' not in all_tokens
        if has_ios_alone and 'ios' not in detected_platforms:
            detected_platforms.add('ios')
        
        platform_counts_str = ':'.join(sorted(detected_platforms)) if detected_platforms else 'none'
        if detected_platforms:
            # Count each unique platform
            for p in detected_platforms:
                platform_counts[p] = platform_counts.get(p, 0) + 1
        
        # === PROTOCOL TOPIC DETECTION ===
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
        
        all_text = (title or '') + ' ' + (sp or '')
        all_text_lower = all_text.lower()
        detected_protocols = set()
        
        for token in re.split(r'[_\-\. ]+', all_text_lower) if all_text_lower else []:
            token_clean = token.strip()
            if token_clean in PROTOCOL_DICT:
                detected_protocols.add(token_clean)
        
        if 'ci-cd' in all_text_lower or 'cicd' in all_text_lower:
            detected_protocols.add('ci-cd')
        
        # sdwan bigram for protocol
        title_words_for_proto = title_lower.split() if title_lower else []
        for i in range(len(title_words_for_proto) - 1):
            bigram = f"{title_words_for_proto[i]} {title_words_for_proto[i+1]}"
            if bigram.strip() == 'sd wan' and 'sdwan' not in detected_protocols:
                detected_protocols.add('sdwan')
        
        if detected_protocols:
            for p in detected_protocols:
                protocol_counts[p] = protocol_counts.get(p, 0) + 1
        
        # === KNOWLEDGE DOMAIN from platform evidence (NOT category) ===
        proposed_domain = classify_domain(detected_platforms)
        domain_counts[proposed_domain] if proposed_domain else domain_counts.__setitem__(proposed_domain, 0)
        if proposed_domain:
            domain_counts[proposed_domain] += 1
        
        # === CONTENT TYPE from platform evidence (NULL if insufficient) ===
        proposed_content_type = classify_content_type(detected_platforms)
        content_type_counts[proposed_content_type] += 1
        
        # === VENDOR SCOPE ===
        vs, pv = vendor_scope  # vendor_scope, proposed_vendor from function
        
        # === CONFIDENCE ===
        has_vendor_ev = bool(pv)
        has_platform_ev = bool(detected_platforms)
        has_protocol_ev = bool(detected_protocols)
        
        conflict_reason = None
        if 'ios-xe' in detected_platforms and 'ios-xr' in detected_platforms:
            conflict_reason = 'conflicting platform tokens: ios-xe and ios-xr'
        
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
        
        review_required = confidence == 'NEEDS_REVIEW' or conflict_reason is not None
        
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
        if pv:
            tags.append(pv)
        if detected_platforms:
            tags.append(list(detected_platforms)[0])
        if detected_protocols:
            tags.append(list(detected_protocols)[0])
        if category:
            tags.append(category)  # Legacy, included but weak
        proposed_tags = tags[:5]
        
        # === Collection from source_path ===
        sp = item['source_path'] if 'item' in dir() else sp  # Will fix below
        collection = 'UNKNOWN'
        if sp:
            parts = sp.replace('\\', '/').split('/')
            if len(parts) >= 2:
                lvl2 = parts[1]
                if lvl2 == 'chat-knowledge':
                    collection = 'CHAT'
                elif lvl2 == 'lecture-data':
                    collection = 'LECTURE'
                elif lvl2 == 'restricted-operations':
                    collection = 'RESTRICTED_OPERATIONS'
        
        collection_counts_out[collection] += 1
        
        # === Build classification record ===
        result = {
            'article_id': article_id,
            'title': title,
            'source_path': sp,
            'collection': collection,
            'source_category': category,  # Legacy, weak evidence only
            'proposed_knowledge_domain': proposed_domain,
            'proposed_platform_family': list(detected_platforms)[0] if detected_platforms else None,
            'proposed_protocol_topic': list(detected_protocols)[0] if detected_protocols else None,
            'proposed_content_type': proposed_content_type,
            'vendor_scope': vs,
            'proposed_vendor': pv,
            'confidence': confidence,
            'evidence_used': evidence_used,
            'conflict_reason': conflict_reason,
            'review_required': review_required,
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
    print(f"  fetched records: {fetched_count}")
    print(f"  output classification records: {classified_count}")
    print(f"  MATCH: {classified_count == fetched_count}")
    print(f"")
    print(f"  Summary buckets:")
    for key, value in summary.items():
        print(f"    {key}: {value}")
    print(f"")
    print(f"  Summary total: {total_summary} (must equal 1314)")
    print(f"  SUM MATCH: {total_summary == 1314}")
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
    print(f"  Content type counts:")
    for ct, cnt in content_type_counts.most_common():
        print(f"    {ct}: {cnt}")
    print(f"")
    
    # Final verification
    print(f"  VERIFICATION:")
    checks = [
        (classified_count == 1314, f"classified_record_count={classified_count} == 1314"),
        (total_summary == 1314, f"summary buckets sum to {total_summary} == 1314"),
        (collection_counts_out.get('CHAT', 0) == 732, f"CHAT=732"),
        (collection_counts_out.get('LECTURE', 0) == 555, f"LECTURE=555"),
        (collection_counts_out.get('RESTRICTED_OPERATIONS', 0) == 27, f"RESTRICTED_OPERATIONS=27"),
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
    # Output individual classification records (read-only summary)
    # ============================================================
    print(f"")
    print(f"=== INDIVIDUAL CLASSIFICATION RECORDS (first 5) ===")
    print(f"")
    
    for r in results[:5]:
        print(f"  Article {r['article_id']}:")
        print(f"    title: {r['title'][:50]}...")
        print(f"    collection: {r['collection']}")
        print(f"    source_path: {r['source_path'][:60] if r['source_path'] else 'NULL'}...")
        print(f"    proposed_knowledge_domain: {r['proposed_knowledge_domain'] or 'NULL'}")
        print(f"    proposed_platform_family: {r['proposed_platform_family'] or 'NULL'}")
        print(f"    proposed_protocol_topic: {r['proposed_protocol_topic'] or 'NULL'}")
        print(f"    proposed_content_type: {r['proposed_content_type'] or 'NULL'}")
        print(f"    vendor_scope: {r['vendor_scope']}")
        print(f"    proposed_vendor: {r['proposed_vendor'] or 'NULL'}")
        print(f"    confidence: {r['confidence']}")
        print(f"    evidence_used: {r['evidence_used']}")
        print(f"    conflict_reason: {r['conflict_reason'] or 'none'}")
        print(f"    review_required: {r['review_required']}")
        print()
    
    if len(results) > 5:
        print(f"  ... ({len(results) - 5} more articles)")
    
    # ============================================================
    # Commit read-only transaction (no writes)
    # ============================================================
    conn.rollback()  # Read-only transaction - just roll back since we made no writes
    # Alternatively: conn.commit()  # if we wanted to keep the read-only setting
    
    print(f"")
    print(f"  Database connection closed (read-only transaction rolled back).")
    print(f"  No production data was modified.")
    print(f"  No INSERT/UPDATE/DELETE/DDL executed.")
    print(f"")
    
    # ============================================================
    # Summary output
    # ============================================================
    print(f"=== FINAL SUMMARY ===")
    print(f"  fetched records: {fetched_count}")
    print(f"  output classification records: {classified_count}")
    print(f"  CHAT: {collection_counts_out.get('CHAT', 0)}")
    print(f"  LECTURE: {collection_counts_out.get('LECTURE', 0)}")
    print(f"  RESTRICTED_OPERATIONS: {collection_counts_out.get('RESTRICTED_OPERATIONS', 0)}")
    print(f"  HIGH_CONFIDENCE: {summary['HIGH_CONFIDENCE']}")
    print(f"  MEDIUM_CONFIDENCE: {summary['MEDIUM_CONFIDENCE']}")
    print(f"  NEEDS_REVIEW: {summary['NEEDS_REVIEW']}")
    print(f"  UNCLASSIFIED: {summary['UNCLASSIFIED']}")
    print(f"  CONFLICT: {summary['CONFLICT']}")
    print(f"  Summary total: {total_summary}")
    print(f"  ALL bucket counts sum to 1314: {total_summary == 1314}")
    print(f"  Collection totals: CHAT={collection_counts_out.get('CHAT',0)==732}, LECTURE={collection_counts_out.get('LECTURE',0)==555}, RESTRICTED_OPERATIONS={collection_counts_out.get('RESTRICTED_OPERATIONS',0)==27}")
    print(f"  Verified read-only: no production writes/schema changes")


if __name__ == '__main__':
    main()
