// ─── LinkedIn Hardcoded Demo Dataset ─────────────────────────────────────────
// Source: LinkedIn press/product pages (Feb + June 2026 launches)

export const LINKEDIN_THREAT = {
  level: 'AMBER',
  brief:
    'LinkedIn is executing a multi-front GTM consolidation: the Feb 2026 Premium All-in-One ' +
    'bundles hiring, marketing and selling for SMBs; the June 2026 Creator Marketplace and ' +
    'BrandWorks build a native B2B creator economy. Together these moves deepen platform ' +
    'lock-in and directly challenge point-solution competitors across every GTM layer.',
  moves: [
    'Sharpen SMB differentiation with cross-platform workflow integrations LinkedIn cannot replicate natively.',
    'Lock in B2B creator partnerships before BrandWorks captures market share in Q3.',
    'Build measurable B2B outcome tracking that demonstrates ROI beyond LinkedIn\'s walled garden.',
  ],
};

export const LINKEDIN_CATEGORIES = [
  {
    id: 'smb-suite',
    type: 'product',
    label: 'SMB Suite',
    color: '#22d3ee',
    description:
      'LinkedIn Premium All-in-One launched Feb 2026 — bundles hiring, marketing and selling ' +
      'workflows into a single SMB subscription. Aggressively priced to displace standalone point solutions.',
    insights: [
      'Premium All-in-One launched Feb 2026 for small businesses',
      'Bundles hiring, marketing and selling in one subscription',
      'Pricing undercuts 3–4 standalone tools per SMB customer',
    ],
    impact: 85,
    children: [
      {
        label: 'Premium All-in-One',
        description: 'Unified SMB intelligence platform — GA February 2026.',
        insights: ['Single dashboard for all SMB ops', 'Trial → paid conversion funnel built in'],
      },
      {
        label: 'Hiring Workflows',
        description: 'AI-powered candidate sourcing against 1B+ LinkedIn profiles.',
        insights: ['Smart candidate matching at SMB scale', 'Job post automation and boosting'],
      },
      {
        label: 'Marketing Workflows',
        description: 'Native SMB ad and content automation inside LinkedIn.',
        insights: ['Sponsored content scheduling', 'Audience targeting with profile data'],
      },
      {
        label: 'Selling Workflows',
        description: 'LinkedIn-native CRM and deal intelligence for SMBs.',
        insights: ['Contact enrichment built into inbox', 'Deal tracking with live profile data'],
      },
    ],
  },
  {
    id: 'creator-tools',
    type: 'creator',
    label: 'Creator Tools',
    color: '#a855f7',
    description:
      'Creator Marketplace and BrandWorks launched June 2026 — enables brands to find, ' +
      'vet and activate creators natively on LinkedIn. First end-to-end B2B creator economy infrastructure.',
    insights: [
      'Creator Marketplace launched June 2026 for brand-creator matching',
      'BrandWorks provides campaign activation and native reporting',
      'First B2B creator economy platform at professional-network scale',
    ],
    impact: 78,
    children: [
      {
        label: 'Creator Marketplace',
        description: 'Brand-creator discovery and vetting engine inside LinkedIn.',
        insights: ['Niche B2B creator targeting by industry', 'Integrated audience vetting'],
      },
      {
        label: 'BrandWorks',
        description: 'End-to-end campaign activation and performance reporting.',
        insights: ['Content approval workflows', 'ROI and reach reporting native to platform'],
      },
      {
        label: 'Creator Matching',
        description: 'AI-powered creator selection by audience fit.',
        insights: ['Audience alignment scoring', 'Category and seniority-level fit analysis'],
      },
      {
        label: 'Campaign Support',
        description: 'Multi-format campaign activation and optimisation layer.',
        insights: ['Video, carousel, document ad support', 'Creator-to-paid amplification bridge'],
      },
    ],
  },
  {
    id: 'marketing',
    type: 'marketing',
    label: 'Marketing Products',
    color: '#00e5ff',
    description:
      'Expanded ad tooling and audience engagement products targeting B2B marketers — ' +
      'richer campaign infrastructure with deeper professional signal targeting.',
    insights: [
      'Expanded ad tooling for creator-led and brand campaigns',
      'Audience Expansion AI increases reach with minimal manual effort',
      'Deeper targeting via job title, seniority and company signals',
    ],
    impact: 72,
    children: [
      {
        label: 'Ad Tooling',
        description: 'Professional audience advertising with richer targeting signals.',
        insights: ['Sponsored content + message ads', 'Audience Expansion AI engine'],
      },
      {
        label: 'Creator Campaigns',
        description: 'Creator-amplified brand campaigns with native reporting.',
        insights: ['Creator posts boosted as paid ads', 'Organic-to-paid content bridge'],
      },
      {
        label: 'Audience Engagement',
        description: 'Multi-format engagement tools for brand building.',
        insights: ['Video, carousel and document ads', 'Event promotion with member targeting'],
      },
      {
        label: 'Brand Activation',
        description: 'Brand awareness products at LinkedIn\'s professional scale.',
        insights: ['Thought leader ads for C-suite voices', 'Company page amplification tools'],
      },
    ],
  },
  {
    id: 'visibility',
    type: 'visibility',
    label: 'Profile Visibility',
    color: '#4ade80',
    description:
      'June 2026 updates expand profile visibility for skills, tools and certifications — ' +
      'increasing credibility signals for professionals and brand pages.',
    insights: [
      'Skills and tool visibility expanded June 2026',
      'Certification display strengthens professional credibility signals',
      'Product visibility for brand pages improved with June updates',
    ],
    impact: 65,
    children: [
      {
        label: 'Skills Visibility',
        description: 'Enhanced skill signal ranking and endorsement display.',
        insights: ['Ranked skill endorsements weighted by expert votes', 'Assessment-backed skill badges'],
      },
      {
        label: 'Tool Visibility',
        description: 'Tech stack disclosure and platform proficiency badges.',
        insights: ['Tool proficiency signals on profile', 'Software-specific certification display'],
      },
      {
        label: 'Certification Display',
        description: 'Credential verification at profile and search level.',
        insights: ['Learning path completion badges', 'Industry certification integration'],
      },
      {
        label: 'Credibility Signals',
        description: 'Trust, authority and verification indicators.',
        insights: ['Verified work history badges', 'Thought leader status designation'],
      },
    ],
  },
  {
    id: 'b2b-growth',
    type: 'b2b',
    label: 'B2B Growth',
    color: '#3b82f6',
    description:
      'LinkedIn\'s 1B+ member professional network deepens as they layer decision-maker ' +
      'targeting, content-led distribution and enterprise credibility tools.',
    insights: [
      '1B+ professional network with decision-maker concentration',
      'Content-led distribution advantage accelerating for enterprise brands',
      'Growing share of global B2B marketing budgets year-over-year',
    ],
    impact: 80,
    children: [
      {
        label: 'Professional Audience',
        description: 'The world\'s largest B2B professional network.',
        insights: ['Largest concentrated professional graph globally', 'High buying intent signals from job context'],
      },
      {
        label: 'Enterprise Credibility',
        description: 'Brand trust infrastructure for enterprise buyers.',
        insights: ['Company page authority signals', 'Employee advocacy amplification tools'],
      },
      {
        label: 'Decision-maker Reach',
        description: 'Direct targeting of C-suite and senior buyer personas.',
        insights: ['Senior seniority + job function filters', 'Company size + revenue targeting'],
      },
      {
        label: 'Content Distribution',
        description: 'Organic and paid content velocity engine.',
        insights: ['Algorithm favors native LinkedIn content', 'Document posts drive highest organic reach'],
      },
    ],
  },
  {
    id: 'threat-signals',
    type: 'threat',
    label: 'Threat Signals',
    color: '#ff3b30',
    description:
      'Composite GTM threat: LinkedIn\'s bundling, creator lock-in and full-funnel B2B ' +
      'ownership represent a multi-vector risk to competitors across SMB, creator and enterprise.',
    insights: [
      'SMB bundling displaces 3–4 standalone point solutions per customer',
      'Creator ecosystem lock-in reduces platform switching by 60–70%',
      'Native GTM tooling makes LinkedIn a full-funnel B2B OS',
    ],
    impact: 92,
    children: [
      {
        label: 'SMB Bundling',
        description: 'All-in-one displacing multiple standalone products.',
        insights: ['Lower cost than 3 separate tools', 'Reduced procurement friction for SMBs'],
      },
      {
        label: 'Creator Lock-in',
        description: 'Creator ecosystem moat via BrandWorks.',
        insights: ['Native creator marketplace creates dependency', 'Creator retention incentives built in'],
      },
      {
        label: 'B2B Funnel Control',
        description: 'Full-funnel ownership from awareness to close.',
        insights: ['Awareness → consideration → close in one platform', 'Data flywheel grows with every interaction'],
      },
      {
        label: 'Native GTM Tools',
        description: 'Platform-native sales and marketing execution.',
        insights: ['Sales Navigator deeply integrated', 'Outreach and DMs without leaving LinkedIn'],
      },
    ],
  },
  {
    id: 'gtm-moves',
    type: 'move',
    label: 'GTM Moves',
    color: '#ff9500',
    description:
      'Strategic counter-moves to address LinkedIn\'s multi-front expansion — ' +
      'focus on differentiation, partnership and demonstrable outcome measurement.',
    insights: [
      'Sharpen SMB differentiation with non-LinkedIn native workflow integrations',
      'Activate B2B creator partnerships before BrandWorks captures supply',
      'Build measurable B2B outcome tracking LinkedIn cannot replicate externally',
    ],
    impact: 88,
    children: [
      {
        label: 'SMB Differentiation',
        description: 'Compete on cross-platform value LinkedIn cannot bundle.',
        insights: ['Focus on integrations spanning multiple platforms', 'Pricing vs LinkedIn All-in-One bundle'],
      },
      {
        label: 'Creator Partnerships',
        description: 'Lock in B2B creators before BrandWorks reaches GA.',
        insights: ['Pre-BrandWorks creator exclusivity agreements', 'Multi-platform creator deal structures'],
      },
      {
        label: 'Workflow Integrations',
        description: 'Deep tech-stack integrations as competitive moat.',
        insights: ['CRM + LinkedIn data bridge investments', 'Automation layer LinkedIn cannot own'],
      },
      {
        label: 'B2B Outcomes',
        description: 'Build measurable ROI platform beyond LinkedIn attribution.',
        insights: ['Cross-channel B2B attribution layer', 'Full-funnel tracking independent of LinkedIn'],
      },
    ],
  },
];
