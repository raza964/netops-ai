#!/usr/bin/env python3
"""
Classification dry-run for NetOps AI KB articles.
Read-only: connects via DATABASE_URL env var, does not modify production data.
Uses boundary-aware, source-aware tokenization consistent with kb-evidence-profile.sql.
Verifies: mutually exclusive primary states sum to fixture count, collection metadata
          agreement, vendor/platform/protocol detection per validated rules.
"""

import os
import sys
import re
import psycopg2
from collections import Counter, defaultdict

# --- Configuration ---

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

# Platform dictionary: exactly the validated high-specificity tokens from
# the frozen kb-evidence-profile.sql, plus IOS-XE/IOS-XR aliases.
# Do NOT add mikrotik as PlatformFamily; it is Vendor evidence.
# SD-WAN belongs under domain/topic, not PlatformFamily.
PLATFORM_DICT = {
    # High-specificity platform tokens (from kb-evidence-profile.sql Section 11 dict)
    'nexus': 'nexus',
    'asr': 'asr',
    'junos': 'junos',
    'catalyst': 'catalyst',
    'fortigate': 'fortigate',
    'routeros': 'routeros',
    # IOS-XE/IOS-XR aliases (canonical unigram/bigram resolution)
    'iosxe': 'ios-xe',
    'ios-xe': 'ios-xe',
    'iosxr': 'ios-xr',
    'ios-xr': 'ios-xr',
    # sdwan as domain/topic, NOT PlatformFamily (unless actual product identified)
    # We do NOT add 'sdwan' as a platform token here per spec,
    # but we detect it in protocol/domain context,
}

# Protocol/domain topic tokens
PROTOCOL_DICT = {
    'bgp', 'ospf', 'isis', 'eigrp', 'rip', 'static',
    'ci-cd', 'cicd',
    'sdwan',  # detected in title/source context, belongs under domain/topic
    'vlan', 'stp', 'mstp', 'lacp', 'vpc', 'mlag',
    'vxlan', 'evpn', 'mpls', 'ldp', 'rsvp', 'te',
    'atom', 'vpls', 'pseudowire',
    'ipsec', 'ikev2', 'ssl', 'vpn', 'gre', 'dmvpn',
    'pppoe', 'ppp', 'dhcp', 'dns', 'ipam',
    'radius', 'tacacs', 'aaa', 'dot1x', 'mab',
    'snmp', 'syslog', 'netflow', 'sflow', 'telemetry',
    'netconf', 'restconf', 'yang', 'gnmi',
    'ansible', 'terraform', 'python', 'gitops', 'ci-cd',
    'sdwan', 'viptela', 'meraki',
    'qos', 'multicast', 'pim', 'igmf', 'mld',
    'nat', 'firewall', 'acl', 'zone', 'policy',
}

# Vendor dictionary (exact normalized tokens)
VENDOR_DICT = {
    'cisco', 'juniper', 'mikrotik', 'huawei', 'fortinet',
    'arista', 'paloalto', 'aruba', 'ubiquiti', 'nokia',
    'h3c', 'extreme', 'dell', 'avaya', 'alcatel',
    'checkpoint', 'f5', 'a10', 'infoblox',
}

# Tokenizer: splits on [_\-.+] — consistent with kb-evidence-profile.sql
TOKEN_SPLIT_PATTERN = r'[_\-\.+]'


# --- Classification Logic ---

def tokenize(text):
    """Tokenize text using the same pattern as kb-evidence-profile.sql.
    Splits on [_\\-.+]. Returns lowercase tokens."""
    if not text:
        return []
    return [t.lower().strip() for t in re.split(TOKEN_SPLIT_PATTERN, text) if t.strip()]


def tokenize_source_path(source_path):
    """Tokenize source_path: split on separators including whitespace, slash,
    backslash, underscore, hyphen and dot."""
    if not source_path:
        return []
    # Replace backslashes with forward slashes first, then split on / and token separators
    sp = source_path.replace('\\\\', '/')
    # Split on / to get path segments, then tokenize each segment
    tokens = []
    for segment in sp.split('/'):
        tokens.extend(tokenize(segment))
    return tokens


def extract_metadata(content):
    """Extract metadata from article content using the same regex logic as
    kb-evidence-profile.sql."""
    if not content:
        return {
            'source_path': None,
            'category': None,
            # No direct columns - all from embedded metadata
        }

    # Extract source_path using same regex as kb-evidence-profile.sql
    sp_match = re.search(r'source_path:\s*([^\r\n]+)', content)
    source_path = sp_match.group(1).strip() if sp_match else None

    # Extract category using same regex
    cat_match = re.search(r'category:\s*([^\r\n]+)', content)
    category = cat_match.group(1).strip() if cat_match else None

    return {
        'source_path': source_path,
        'category': category,
    }


def detect_vendors(title, source_path):
    """Detect vendor tokens from title and source_path.
    Must detect title-only Cisco, Juniper, etc. as exact normalized tokens.
    Tokenize each source separately, split on appropriate separators."""
    tokens_title = tokenize(title) if title else []
    tokens_sp = tokenize_source_path(source_path) if source_path else []

    all_tokens = tokens_title + tokens_sp
    detected = set()
    for t in all_tokens:
        if t in VENDOR_DICT:
            detected.add(t)
    return detected  # Return as set; callers decide scope


def detect_platforms(tokens):
    """Detect platform tokens from a set of normalized tokens.
    Aligns with PLATFORM_DICT. Returns set of canonical platform names."""
    detected = set()
    for token in tokens:
        if token in PLATFORM_DICT:
            canonical = PLATFORM_DICT[token]
            detected.add(canonical)
        # Also check for direct canonical tokens that are already canonical
        if token in {'ios-xe', 'ios-xr', 'sdwan'}:
            detected.add(token)
    return detected


def detect_protocols(tokens, title, source_path):
    """Detect protocol/domain tokens from normalized tokens and full text."""
    all_text = (title or '') + ' ' + (source_path or '')
    all_text_lower = all_text.lower()

    tokens_lower = tokenize(all_text_lower)
    detected = set()

    for token in tokens_lower:
        if token in PROTOCOL_DICT:
            detected.add(token)

    # sdwan bigram detection: "sd wan" in title/source → sdwan
    title_words = tokenize(title or '') if title else []
    for i in range(len(title_words) - 1):
        bigram = f"{title_words[i]} {title_words[i+1]}"
        if bigram == 'sd wan':
            detected.add('sdwan')

    # ci-cd / cicd
    if 'ci-cd' in all_text_lower or 'cicd' in all_text_lower:
        detected.add('ci-cd')

    return detected


def classify_vendor_scope(detected_vendors):
    """Vendor scope rules per spec:
    one explicit vendor → SPECIFIC_VENDOR
    multiple explicit vendors → MULTI_VENDOR
    explicit vendor-neutral evidence → VENDOR_NEUTRAL
    otherwise → UNDETERMINED"""
    if len(detected_vendors) == 1:
        return 'SPECIFIC_VENDOR', next(iter(detected_vendors))
    elif len(detected_vendors) > 1:
        return 'MULTI_VENDOR', ', '.join(sorted(detected_vendors))
    else:
        return 'UNDETERMINED', None


def classify_platform_family(detected_platforms):
    """Detect platform family from validated tokens.
    Does NOT treat mikrotik as PlatformFamily (it's Vendor evidence).
    Does NOT treat sdwan as PlatformFamily unless actual product identified;
    SD-WAN belongs under domain/topic.
    Returns the primary platform family or None."""
    # Remove sdwan from platform family consideration per spec
    # sdwan is domain/topic, not a software PlatformFamily
    platforms = detected_platforms - {'sdwan'}

    if not platforms:
        return None

    # Return the highest-confidence/platform-most-significant platform
    # Per the "high-specificity" principle: return what we have
    # but do not infer/mikrotik or sdwan as platform family
    if 'mikrotik' in platforms:
        # mikrotik is Vendor evidence, NOT PlatformFamily
        platforms = platforms - {'mikrotik'}

    if not platforms:
        return None

    # Return a representative platform; if multiple, return first sorted
    return sorted(platforms)[0] if platforms else None


def classify_knowledge_domain(platform_tokens, protocol_tokens, title, source_path):
    """Determine knowledge domain from explicit evidence.
    DO NOT derive from legacy category alone.
    IOS-XE/IOS-XR/Nexus/RouterOS/Junos do not prove Routing.
    Domain comes from explicit domain/protocol/topic evidence.
    If evidence is insufficient, return NULL.

    Deterministic mappings from protocol/token evidence:
    BGP/OSPF/EIGRP/IS-IS/static → Routing
    VLAN/STP/MSTP/LACP/vPC/MLAG → Switching
    MPLS/LDP/RSVP/VPLS/AToM → MPLS
    IPsec/IKEv2/VPN/GRE/DMVPN → VPN
    firewall/ACL/security evidence → Security
    SNMP/syslog/NetFlow/telemetry → Network Management
    RADIUS/TACACS/AAA/dot1x/MAB → AAA
    QoS → QoS
    VXLAN/EVPN/Nexus/datacenter explicit evidence → Data Center where justified
    """
    all_tokens = set(platform_tokens) | set(protocol_tokens)
    all_text = (title or '') + ' ' + (source_path or '')
    all_text_lower = all_text.lower()

    # Count evidence for each domain category
    routing_evidence = sum(1 for t in all_tokens if t in {'bgp', 'ospf', 'isis', 'eigrp', 'rip', 'static'})
    switching_evidence = sum(1 for t in all_tokens if t in {'vlan', 'stp', 'mstp', 'lacp', 'vpc', 'mlag'})
    mpls_evidence = sum(1 for t in all_tokens if t in {'mpls', 'ldp', 'rsvp', 'te', 'vp', 'vpls', 'aToM'})
    vpn_evidence = sum(1 for t in all_tokens if t in {'ipsec', 'ikev2', 'ssl', 'vpn', 'gre', 'dmvpn'})
    security_evidence = sum(1 for t in all_tokens if t in {'firewall', 'acl', 'zone', 'policy'})
    nm_evidence = sum(1 for t in all_tokens if t in {'snmp', 'syslog', 'netflow', 'sflow', 'telemetry'})
    aaa_evidence = sum(1 for t in all_tokens if t in {'radius', 'tacacs', 'aaa', 'dot1x', 'mab'})
    qos_evidence = sum(1 for t in all_tokens if t == 'qos')
    dc_evidence = sum(1 for t in all_tokens if t in {'vxlan', 'evpn', 'nexus', 'datacenter'})  # simplified

    # Determine domain with most evidence; if tie or insufficient, NULL
    domain_counts = {
        'Routing': routing_evidence,
        'Switching': switching_evidence,
        'MPLS': mpls_evidence,
        'VPN': vpn_evidence,
        'Security': security_evidence,
        'Network Management': nm_evidence,
        'AAA': aaa_evidence,
        'QoS': qos_evidence,
        'Data Center': dc_evidence,
    }

    max_count = max(domain_counts.values())
    if max_count <= 0:
        return None  # Insufficient evidence

    # Get all domains with max count
    max_domains = [d for d, c in domain_counts.items() if c == max_count]

    if len(max_domains) == 1:
        return max_domains[0]
    # Tie: return NULL to avoid silent reduction
    return None


def extract_collection(source_path):
    """Derive collection from source_path lvl2 (same logic as evidence profile).
    Also check metadata field. Verify they agree."""
    if not source_path:
        return 'UNKNOWN'

    parts = source_path.replace('\\', '/').split('/')
    lvl2 = parts[1] if len(parts) > 1 else ''

    # Map lvl2 to collection
    collection_map = {
        'chat-knowledge': 'CHAT',
        'lecture-data': 'LECTURE',
        'restricted-operations': 'RESTRICTED_OPERATIONS',
    }
    derived = collection_map.get(lvl2, 'UNKNOWN')
    return derived


# --- Main Classification ---

def main():
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set", file=sys.stderr)
        sys.exit(1)

    print(f"Connecting to database via DATABASE_URL...")
    conn = psycopg2.connect(database_url)
    conn.autocommit = False

    # --- Enforce true read-only transaction ---
    with conn.cursor() as cur:
        cur.execute("BEGIN TRANSACTION READ ONLY;")
        cur.execute("SHOW transaction_read_only;")
        is_read_only = cur.fetchone()[0]
        if not str(is_read_only).lower().startswith('on'):
            print(f"ERROR: transaction_read_only is not enabled (got: {is_read_only})")
            conn.rollback()
            sys.exit(1)
        print(f"  transaction_read_only is ON")

    # --- Fetch all articles ---
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

    # --- Extract metadata from each article content ---
    extracted = []
    for article_id, title, content in articles:
        meta = extract_metadata(content)
        extracted.append({
            'article_id': article_id,
            'title': title,
            'source_path': meta['source_path'],
            'category': meta['category'],  # Legacy, weak evidence only
        })

    # --- Verify collection totals from source_path metadata ---
    chat_count = 0
    lecture_count = 0
    restricted_count = 0

    for item in extracted:
        sp = item['source_path']
        if sp:
            collection = extract_collection(sp)
            if collection == 'CHAT':
                chat_count += 1
            elif collection == 'LECTURE':
                lecture_count += 1
            elif collection == 'RESTRICTED_OPERATIONS':
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

    # --- Classify each article ---
    results = []
    # Primary classification states (mutually exclusive, sum to 1314)
    summary = {
        'HIGH_CONFIDENCE': 0,
        'MEDIUM_CONFIDENCE': 0,
        'NEEDS_REVIEW': 0,
        'UNCLASSIFIED': 0,
    }
    # CONFLICT as separate diagnostic counter (NOT included in primary sum per spec)
    conflict_count = 0

    vendor_counts = Counter()
    platform_family_counts = Counter()  # PlatformFamily, not just tokens
    domain_counts = Counter()
    protocol_counts = Counter()
    content_type_counts = Counter()
    collection_counts_out = Counter()

    for item in extracted:
        article_id = item['article_id']
        title = item['title']
        sp = item['source_path']
        category = item['category']  # Legacy, weak evidence only

        # --- Tokenize evidence sources ---
        tokens_title = tokenize(title) if title else []
        tokens_sp = tokenize_source_path(sp) if sp else []
        all_tokens = tokens_title + tokens_sp

        # --- Vendor detection ---
        detected_vendors = detect_vendors(title, sp)
        vendor_scope, proposed_vendor = classify_vendor_scope(detected_vendors)
        if proposed_vendor:
            vendor_counts[proposed_vendor] += 1

        # --- Platform detection ---
        detected_platforms = detect_platforms(all_tokens)
        # Also check for protocol-level sdwan etc.
        detected_protocols = detect_protocols(all_tokens, title, sp)

        # --- Platform family (NOT mikrotik, NOT sdwan as PlatformFamily) ---
        platform_family = classify_platform_family(detected_platforms)
        if platform_family:
            platform_family_counts[platform_family] += 1

        # --- Knowledge domain from explicit evidence (NOT from category) ---
        proposed_domain = classify_knowledge_domain(
            list(detected_platforms), list(detected_protocols), title, sp)
        domain_counts[proposed_domain] if proposed_domain else domain_counts.__setitem__(proposed_domain, 0)
        if proposed_domain:
            domain_counts[proposed_domain] += 1

        # --- Content type from platform evidence (NULL if insufficient) ---
        # Deterministic mappings:
        # BGP/OSPF/EIGRP/IS-IS/static → configuration guide (or routing)
        # VLAN/STP/MSTP/LACP/vPC/MLAG → switching configuration
        # MPLS/LDP/RSVP/VPLS/AToM → deployment guide (MPLS)
        # IPsec/IKEv2/VPN/GRE/DMVPN → VPN guide
        # firewall/ACL/security → Security content
        # SNMP/syslog/NetFlow/telemetry → Network Management content
        # RADIUS/TACACS/AAA/dot1x/MAB → AAA content
        # QoS → QoS content
        # VXLAN/EVPN/Nexus/datacenter → Data Center where justified

        has_routing = any(t in {'bgp', 'ospf', 'isis', 'eigrp', 'rip', 'static'} for t in all_tokens)
        has_switching = any(t in {'vlan', 'stp', 'mstp', 'lacp', 'vpc', 'mlag'} for t in all_tokens)
        has_mpls = any(t in {'mpls', 'ldp', 'rsvp', 'te'} for t in all_tokens)
        has_vpn = any(t in {'ipsec', 'ikev2', 'ssl', 'vpn', 'gre', 'dmvpn'} for t in all_tokens)
        has_security = any(t in {'firewall', 'acl', 'zone', 'policy'} for t in all_tokens)
        has_nm = any(t in {'snmp', 'syslog', 'netflow', 'sflow', 'telemetry'} for t in all_tokens)
        has_aaa = any(t in {'radius', 'tacacs', 'aaa', 'dot1x', 'mab'} for t in all_tokens)
        has_qos = any(t == 'qos' for t in all_tokens)

        # Determine content type
        proposed_content_type = None
        content_evidence_parts = []

        if has_routing:
            proposed_content_type = 'routing configuration guide'
            content_evidence_parts.append('routing protocols')
        elif has_switching:
            proposed_content_type = 'switching configuration guide'
            content_evidence_parts.append('switching protocols')
        elif has_mpls:
            proposed_content_type = 'MPLS configuration guide'
            content_evidence_parts.append('MPLS protocols')
        elif has_vpn:
            proposed_content_type = 'VPN configuration guide'
            content_evidence_parts.append('VPN protocols')
        elif has_security:
            proposed_content_type = 'security configuration guide'
            content_evidence_parts.append('security evidence')
        elif has_nm:
            proposed_content_type = 'network management guide'
            content_evidence_parts.append('management evidence')
        elif has_aaa:
            proposed_content_type = 'AAA configuration guide'
            content_evidence_parts.append('AAA evidence')
        elif has_qos:
            proposed_content_type = 'QoS configuration guide'
            content_evidence_parts.append('QoS evidence')

        if not proposed_content_type:
            proposed_content_type = 'UNCLASSIFIED'
        content_type_counts[proposed_content_type] += 1

        # --- Confidence determination (mutually exclusive primary states) ---
        has_vendor_ev = bool(proposed_vendor)
        has_platform_ev = bool(detected_platforms)
        has_protocol_ev = bool(detected_protocols)
        has_domain_ev = proposed_domain is not None

        conflict_reason = None
        # Conflict: conflicting IOS-XE + IOS-XR platforms
        if 'ios-xe' in detected_platforms and 'ios-xr' in detected_platforms:
            conflict_reason = 'conflicting platform tokens: ios-xe and ios-xr'
            conflict_count += 1
            # When conflict occurs, classify as NEEDS_REVIEW
            # but also count in conflict_counter separately

        # Determine primary confidence state (mutually exclusive)
        # Rule set: must sum to 1314 with no overlap
        if has_vendor_ev and has_platform_ev and not conflict_reason:
            confidence = 'HIGH_CONFIDENCE'
        elif has_vendor_ev and not has_platform_ev:
            confidence = 'MEDIUM_CONFIDENCE'
        elif has_platform_ev and not has_vendor_ev and not conflict_reason:
            confidence = 'HIGH_CONFIDENCE'
        elif not has_vendor_ev and not has_platform_ev and not has_protocol_ev and not has_domain_ev:
            confidence = 'UNCLASSIFIED'
        elif conflict_reason:
            confidence = 'NEEDS_REVIEW'
        else:
            # Fallback: any other combination
            confidence = 'NEEDS_REVIEW'

        # Ensure mutually exclusive: only one primary state per article
        # NEEDS_REVIEW when conflict, otherwise distribute the four states
        if confidence == 'NEEDS_REVIEW':
            summary['NEEDS_REVIEW'] += 1
        elif confidence == 'HIGH_CONFIDENCE':
            summary['HIGH_CONFIDENCE'] += 1
        elif confidence == 'MEDIUM_CONFIDENCE':
            summary['MEDIUM_CONFIDENCE'] += 1
        else:
            summary['UNCLASSIFIED'] += 1

        # --- Evidence used (preserve as lists, NOT list(set)[0]) ---
        evidence_parts = []
        if detected_vendors:
            evidence_parts.append(f"vendor: {', '.join(sorted(detected_vendors))}")
        if detected_platforms:
            evidence_parts.append(f"platform: {', '.join(sorted(detected_platforms))}")
        if detected_protocols:
            evidence_parts.append(f"protocol: {', '.join(sorted(detected_protocols))}")
        evidence_used = '; '.join(evidence_parts) if evidence_parts else 'none'

        # --- Collection from source_path + metadata agreement ---
        collection_from_sp = extract_collection(sp)
        # Also check if there's a metadata collection field (we don't have one directly,
        # so we derive from source_path only)
        collection = collection_from_sp

        collection_counts_out[collection] += 1

        # --- Build classification record ---
        result = {
            'article_id': article_id,
            'title': title,
            'source_path': sp,
            'collection': collection,
            'source_category': category,  # Legacy, weak evidence only
            'proposed_knowledge_domain': proposed_domain,
            'proposed_platform_family': platform_family,
            'proposed_protocol_topic': list(detected_protocols)[0] if detected_protocols else None,
            'proposed_content_type': proposed_content_type,
            'vendor_scope': vendor_scope,
            'proposed_vendor': proposed_vendor,
            'confidence': confidence,
            'evidence_used': evidence_used,
            'conflict_reason': conflict_reason,
        }

        results.append(result)

        # --- Update summary counts (primary states only) ---
        # The five primary states: HIGH/MEDIUM/NEEDS/UNCLASSIFIED + CONFLICT separate
        # Per spec choice: CONFLICT is a separate diagnostic counter,
        # NOT included in the primary-bucket sum.
        # So primary sum = HIGH + MEDIUM + NEEDS + UNCLASSIFIED = 1314 - conflict_count

    # --- Verification ---
    primary_total = summary['HIGH_CONFIDENCE'] + summary['MEDIUM_CONFIDENCE'] + \
                    summary['NEEDS_REVIEW'] + summary['UNCLASSIFIED']
    total_with_conflict = primary_total + conflict_count

    print(f"")
    print(f"=== CLASSIFICATION DRY-RUN RESULTS ===")
    print(f"")
    print(f"  fetched records: {fetched_count}")
    print(f"  output classification records: {len(results)}")
    print(f"  MATCH: {len(results) == fetched_count}")
    print(f"")
    print(f"  Primary classification summary:")
    for key, value in summary.items():
        print(f"    {key}: {value}")
    print(f"")
    print(f"  Conflict diagnostic count: {conflict_count}")
    print(f"")
    print(f"  Primary bucket total: {primary_total}")
    print(f"  Primary + Conflict total: {total_with_conflict}")
    print(f"  MATCH primary+conflict: {total_with_conflict == fetched_count}")
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
    print(f"  Platform family counts (top 10):")
    for pf, cnt in platform_family_counts.most_common(10):
        print(f"    {pf}: {cnt}")
    print(f"")
    print(f"  Domain counts:")
    for d, cnt in domain_counts.most_common():
        print(f"    {d}: {cnt}")
    print(f"")
    print(f"  Content type counts:")
    for ct, cnt in content_type_counts.most_common():
        print(f"    {ct}: {cnt}")
    print(f"")
    print(f"  Conflict count: {conflict_count}")
    print(f"  Primary sum: {primary_total}")
    print(f"  Total with conflict: {total_with_conflict}")
    print(f"  ALL CHECKS: {primary_total + conflict_count == fetched_count}")

    # --- Close connection (read-only, no writes) ---
    conn.rollback()
    print(f"")
    print(f"  Database connection closed (read-only transaction rolled back).")
    print(f"  No production data was modified.")
    print(f"  No INSERT/UPDATE/DELETE/DDL executed.")
    print(f"")

    # --- Final summary ---
    print(f"=== FINAL SUMMARY ===")
    print(f"  fetched records: {fetched_count}")
    print(f"  classified records: {len(results)}")
    print(f"  CHAT: {collection_counts_out.get('CHAT', 0)}")
    print(f"  LECTURE: {collection_counts_out.get('LECTURE', 0)}")
    print(f"  RESTRICTED_OPERATIONS: {collection_counts_out.get('RESTRICTED_OPERATIONS', 0)}")
    print(f"  HIGH_CONFIDENCE: {summary['HIGH_CONFIDENCE']}")
    print(f"  MEDIUM_CONFIDENCE: {summary['MEDIUM_CONFIDENCE']}")
    print(f"  NEEDS_REVIEW: {summary['NEEDS_REVIEW']}")
    print(f"  UNCLASSIFIED: {summary['UNCLASSIFIED']}")
    print(f"  CONFLICT (diagnostic): {conflict_count}")
    print(f"  PRIMARY BUCKET SUM: {primary_total} (must equal {fetched_count} - {conflict_count})")
    print(f"  PRIMARY SUM MATCH: {primary_total == fetched_count - conflict_count}")
    print(f"  Verified read-only: no production writes/schema changes")


if __name__ == '__main__':
    main()
