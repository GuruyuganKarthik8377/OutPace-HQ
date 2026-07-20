import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import GlobeGL from 'react-globe.gl';
import * as THREE from 'three';
import axios from 'axios';
import {
  Search, AlertTriangle, CheckCircle2, Zap, Brain, FileCheck,
  ListOrdered, Rocket, Globe2, TrendingUp, Database, Cpu,
  DollarSign, Users, Package, ShieldAlert, Swords, Radio,
  Target, X, ChevronRight, MessageCircle,
} from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import { LINKEDIN_CATEGORIES, LINKEDIN_THREAT } from './data/linkedin';
import EventRadarPage from './EventRadar';
import EventCopilotPage from './eventCopilot/EventCopilot';
import ConciergeChat from './eventCopilot/ConciergeChat';
import './App.css';

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  hub:        '#ff2d6d',
  product:    '#22d3ee',
  creator:    '#a855f7',
  marketing:  '#00e5ff',
  visibility: '#4ade80',
  b2b:        '#3b82f6',
  funding:    '#00e5ff',
  people:     '#a855f7',
  threat:     '#ff3b30',
  move:       '#ff9500',
};

// ─── Generic fallback categories ─────────────────────────────────────────────
const GENERIC_CATEGORIES = [
  {
    id: 'funding', type: 'funding', label: 'Funding', color: C.funding,
    description: 'Funding intelligence, investor signals and financial velocity.',
    insights: ['Latest funding rounds identified', 'Investor relationship graph mapped', 'Burn rate estimated from hiring velocity'],
    impact: 75,
    children: [
      { label: 'Series Rounds',  description: 'Recent funding activity.',  insights: ['Round size and lead investors', 'Post-money valuation signals'] },
      { label: 'Investors',      description: 'Key investor profiles.',     insights: ['Portfolio overlap analysis', 'Strategic alignment signals'] },
      { label: 'Burn Rate',      description: 'Financial velocity proxy.',  insights: ['Hiring velocity as proxy', 'Estimated runway range'] },
      { label: 'Valuation',      description: 'Market cap signals.',        insights: ['Valuation trend delta', 'Comparable funding rounds'] },
    ],
  },
  {
    id: 'people', type: 'people', label: 'People', color: C.people,
    description: 'Leadership, hiring signals and team composition intelligence.',
    insights: ['Leadership changes detected', 'Hiring signal clusters mapped', 'Org structure analysed'],
    impact: 70,
    children: [
      { label: 'Leadership',     description: 'C-suite and VP movements.',   insights: ['Recent executive hires', 'Background signals'] },
      { label: 'Hiring Signals', description: 'Open roles and velocity.',    insights: ['Role concentration areas', 'Growth direction indicators'] },
      { label: 'Org Structure',  description: 'Team composition signals.',   insights: ['Team size estimate', 'Technical vs GTM split'] },
      { label: 'Departures',     description: 'Leadership exit signals.',    insights: ['Recent senior exits', 'Linked team displacement'] },
    ],
  },
  {
    id: 'product', type: 'product', label: 'Product', color: C.product,
    description: 'Feature set, pricing strategy and product velocity signals.',
    insights: ['Product roadmap signals identified', 'Pricing positioning mapped', 'Review sentiment analysed'],
    impact: 80,
    children: [
      { label: 'Features',    description: 'Recent feature launches.',    insights: ['New capabilities vs yours', 'Feature gap analysis complete'] },
      { label: 'Pricing',     description: 'Pricing strategy signals.',   insights: ['Tier structure mapped', 'ICP targeting signals'] },
      { label: 'Reviews',     description: 'Customer sentiment signals.', insights: ['G2/Capterra sentiment', 'Win/loss pattern signals'] },
      { label: 'Integrations',description: 'Tech stack signals.',         insights: ['Key integration partners', 'API ecosystem map'] },
    ],
  },
  {
    id: 'threat-signals', type: 'threat', label: 'Threat Signals', color: C.threat,
    description: 'GTM threat model, ICP overlap and displacement risk analysis.',
    insights: ['Composite threat score calculated', 'ICP overlap zones identified', 'Displacement risk mapped'],
    impact: 88,
    children: [
      { label: 'ICP Overlap',       description: 'Shared target segment zones.',   insights: ['Account-level overlap', 'Segment concentration'] },
      { label: 'Positioning',       description: 'Competitive narrative gaps.',    insights: ['Message differentiation gaps', 'Win rate signals'] },
      { label: 'Displacement Risk', description: 'Churn trigger analysis.',        insights: ['At-risk account patterns', 'Switch trigger signals'] },
      { label: 'Win/Loss',          description: 'Competitive outcome signals.',   insights: ['Recent deal loss patterns', 'Win driver matrix'] },
    ],
  },
  {
    id: 'gtm-moves', type: 'move', label: 'GTM Moves', color: C.move,
    description: 'Strategic counter-moves ranked by revenue impact and speed.',
    insights: ['3 high-impact counter-moves generated', 'Prioritised by revenue potential', 'Quick wins identified'],
    impact: 85,
    children: [
      { label: 'Quick Wins',   description: 'Immediate revenue actions.',    insights: ['Battle card deployment', 'At-risk account outreach'] },
      { label: 'Positioning',  description: 'Messaging differentiation.',    insights: ['Win story templates', 'Comparison page brief'] },
      { label: 'Roadmap',      description: 'Feature gap closure priority.', insights: ['Top 3 feature gaps', 'Timeline estimates by quarter'] },
      { label: 'Partnerships', description: 'Alliance and channel moves.',   insights: ['Partner program gaps', 'Channel displacement'] },
    ],
  },
];

// ─── THREE.js helpers ─────────────────────────────────────────────────────────

function animSc(obj, target, dur) {
  if (!obj) return;
  const s0 = obj.scale.x, t0 = Date.now();
  const tick = () => {
    const t = Math.min(1, (Date.now() - t0) / dur);
    const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    obj.scale.setScalar(s0 + (target - s0) * e);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function animOp(mat, target, dur) {
  if (!mat) return;
  const o0 = mat.opacity, t0 = Date.now();
  const tick = () => {
    const t = Math.min(1, (Date.now() - t0) / dur);
    mat.opacity = o0 + (target - o0) * t;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ─── Seeded LCG random ────────────────────────────────────────────────────────
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; };
}

// ─── Spherical (Fibonacci) point distribution ─────────────────────────────────
function fibonacciSphere(n, jitter = 0) {
  const pts = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y   = 1 - (i / (n - 1)) * 2;
    const r   = Math.sqrt(1 - y * y);
    const th  = phi * i + jitter;
    pts.push({
      lat: Math.asin(y) * (180 / Math.PI),
      lng: (Math.atan2(Math.sin(th) * r, Math.cos(th) * r)) * (180 / Math.PI),
    });
  }
  return pts;
}

// ─── Primary cluster layout engine ───────────────────────────────────────────
// Hub center → categories radiate → children fan out from each category.
// Each category also gets extra "echo" leaf nodes for visual density.
function computeClusterNodes(clusterId, center, categories, seed = 42) {
  const rand  = lcg(seed);
  const nodes = [], arcs  = [];

  const hub = {
    id: `${clusterId}-hub`, label: clusterId,
    lat: center.lat, lng: center.lng, alt: 0.35,
    type: 'hub', color: C.hub, isHub: true, clusterId,
  };
  nodes.push(hub);

  const N = categories.length;
  const baseAngle = rand() * Math.PI * 2;

  categories.forEach((cat, ci) => {
    // Even angular distribution + slight jitter
    const angle  = baseAngle + (ci / N) * Math.PI * 2;
    const noise  = (rand() - 0.5) * 0.3;
    const spread = 28 + rand() * 6;
    const catLat = center.lat + Math.sin(angle + noise) * spread;
    const catLng = center.lng + Math.cos(angle + noise) * spread;

    const catNode = {
      id: `${clusterId}-${cat.id}`, label: cat.label,
      lat: catLat, lng: catLng, alt: 0.22,
      type: cat.type, color: cat.color,
      description: cat.description, insights: cat.insights, impact: cat.impact,
      clusterId, isCategory: true,
    };
    nodes.push(catNode);
    arcs.push({ fromId: hub.id, toId: catNode.id, type: 'hub-cat' });

    // Children fan out in a neat arc on the far side of the category from hub
    const M = cat.children?.length ?? 0;
    cat.children?.forEach((child, chi) => {
      const fanAngle = angle + Math.PI + (chi - (M - 1) / 2) * 0.7;
      const cNoise   = (rand() - 0.5) * 0.15;
      const childRadius = 10 + rand() * 4;
      nodes.push({
        id: `${catNode.id}-c${chi}`, label: child.label,
        lat: catLat + Math.sin(fanAngle + cNoise) * childRadius,
        lng: catLng + Math.cos(fanAngle + cNoise) * childRadius,
        alt: 0.10 + rand() * 0.08,
        type: 'child', color: catNode.color,
        parentId: catNode.id,
        description: child.description, insights: child.insights,
        clusterId, isChild: true,
      });
      arcs.push({ fromId: catNode.id, toId: `${catNode.id}-c${chi}`, type: 'cat-child' });
    });

    // Extra echo/leaf nodes for visual richness — orbit out further from category
    const EXTRA = 3;
    for (let ei = 0; ei < EXTRA; ei++) {
      const eAngle  = angle + (ei / EXTRA) * Math.PI * 1.5 + rand() * 0.5;
      const eRadius = 14 + rand() * 8;
      const eId     = `${catNode.id}-e${ei}`;
      nodes.push({
        id: eId, label: '',
        lat: catLat + Math.sin(eAngle) * eRadius,
        lng: catLng + Math.cos(eAngle) * eRadius,
        alt: 0.06 + rand() * 0.05,
        type: 'leaf', color: catNode.color,
        parentId: catNode.id,
        clusterId, isLeaf: true,
      });
      arcs.push({ fromId: catNode.id, toId: eId, type: 'cat-leaf' });
    }
  });

  return { nodes, arcs };
}

// ─── Secondary echo clusters (smaller, dimmer copies of the primary) ──────────
function buildEchoClusters(primaryNodes, primaryArcs, categories, seed = 99) {
  const rand   = lcg(seed);
  const nodes  = [], arcs = [];
  // Place 8 echo clusters distributed around the globe using fibonacci spacing
  // — skip the front-facing zone (exclusion zone near 0,0)
  const allPts = fibonacciSphere(24, rand() * 6.28);
  const pts    = allPts.filter(p => {
    const d2 = (p.lat - 10) ** 2 + (p.lng - 0) ** 2;
    return d2 > 1600; // exclude within ~40 degrees of primary
  }).slice(0, 8);

  pts.forEach((center, ci) => {
    const echoSeed = seed + ci * 37;
    const er       = lcg(echoSeed);
    const echoId   = `echo-${ci}`;
    const scaleFactor = 0.6; // echo clusters are smaller

    // Pick a color from the category palette deterministically
    const catColors = categories.map(c => c.color);
    const hubColor  = catColors[Math.floor(er() * catColors.length)];

    const echoHub = {
      id: `${echoId}-hub`, label: '',
      lat: center.lat, lng: center.lng, alt: 0.18,
      type: 'echo-hub', color: hubColor, isEcho: true,
    };
    nodes.push(echoHub);

    // Each echo cluster gets a subset of categories as mini-nodes
    const numCats = 3 + Math.floor(er() * 4);
    const echoCats = categories.slice(0, numCats);
    echoCats.forEach((cat, cIdx) => {
      const angle    = (cIdx / numCats) * Math.PI * 2 + er() * 0.5;
      const catRadius = (16 + er() * 6) * scaleFactor;
      const echoLat  = center.lat + Math.sin(angle) * catRadius;
      const echoLng  = center.lng + Math.cos(angle) * catRadius;
      const echoNodeId = `${echoId}-c${cIdx}`;

      nodes.push({
        id: echoNodeId, label: '',
        lat: echoLat, lng: echoLng, alt: 0.12,
        type: 'echo', color: cat.color, isEcho: true,
      });
      arcs.push({ fromId: echoHub.id, toId: echoNodeId, type: 'echo-arc' });

      // A few leaf nodes per echo category
      const numLeaves = 2 + Math.floor(er() * 3);
      for (let li = 0; li < numLeaves; li++) {
        const la = angle + (li / numLeaves) * Math.PI + er() * 0.4;
        const lr = (5 + er() * 5) * scaleFactor;
        const lid = `${echoNodeId}-l${li}`;
        nodes.push({
          id: lid, label: '',
          lat: echoLat + Math.sin(la) * lr,
          lng: echoLng + Math.cos(la) * lr,
          alt: 0.05 + er() * 0.04,
          type: 'echo-leaf', color: cat.color, isEcho: true,
        });
        arcs.push({ fromId: echoNodeId, toId: lid, type: 'echo-leaf-arc' });
      }
    });
  });

  return { nodes, arcs };
}

// ─── Static ambient nodes (always visible, very dim) ─────────────────────────
function buildAmbientNodes() {
  const nodes = [], arcs = [];
  const ambColors = ['#1e3a8a', '#312e81', '#172554', '#4c1d95', '#0f766e', '#1e4060', '#2d1b5e'];
  // 16 ambient clusters via deterministic fibonacci
  const pts = fibonacciSphere(22, 1.61803).filter(p => {
    const d2 = (p.lat - 10) ** 2 + (p.lng - 0) ** 2;
    return d2 > 400;
  }).slice(0, 16);

  pts.forEach((center, ci) => {
    const rand  = lcg(ci * 1337 + 7);
    const color = ambColors[Math.floor(rand() * ambColors.length)];
    const hubId = `amb-${ci}-h`;

    nodes.push({
      id: hubId, label: '',
      lat: center.lat, lng: center.lng, alt: 0.10,
      color, type: 'ambient-hub', isAmbient: true,
    });

    const numChildren = 4 + Math.floor(rand() * 6);
    for (let i = 0; i < numChildren; i++) {
      const a  = (i / numChildren) * Math.PI * 2 + rand() * 0.5;
      const r  = 5 + rand() * 10;
      const cId = `amb-${ci}-s${i}`;
      nodes.push({
        id: cId, label: '',
        lat: center.lat + Math.sin(a) * r,
        lng: center.lng + Math.cos(a) * r,
        alt: 0.03 + rand() * 0.05,
        color, type: 'ambient', isAmbient: true,
      });
      arcs.push({ fromId: hubId, toId: cId, type: 'ambient-arc' });
    }
  });
  return { nodes, arcs };
}

// Pre-compute static ambient layer
const { nodes: AMBIENT_NODES, arcs: AMBIENT_ARCS } = buildAmbientNodes();

// ─── Node THREE.Group factory — stateful geometry swap ───────────────────────
// Every node group contains BOTH sphere meshes (default) and crystal meshes (selected).
// Selecting a node just toggles which sub-group is visible.

const NODE_SIZES = {
  hub:        { inner: 3.2,  outer: 8.0,  baseOp: 0.40, innerOp: 1.0  },
  category:   { inner: 1.8,  outer: 4.5,  baseOp: 0.30, innerOp: 1.0  },
  child:      { inner: 0.9,  outer: 2.2,  baseOp: 0.22, innerOp: 1.0  },
  leaf:       { inner: 0.55, outer: 1.4,  baseOp: 0.18, innerOp: 0.90 },
  echo_hub:   { inner: 1.4,  outer: 3.5,  baseOp: 0.18, innerOp: 0.70 },
  echo:       { inner: 0.7,  outer: 1.8,  baseOp: 0.12, innerOp: 0.55 },
  echo_leaf:  { inner: 0.4,  outer: 1.0,  baseOp: 0.08, innerOp: 0.40 },
  ambient_hub:{ inner: 0.5,  outer: 1.2,  baseOp: 0.08, innerOp: 0.25 },
  ambient:    { inner: 0.28, outer: 0.7,  baseOp: 0.05, innerOp: 0.15 },
};

function getSizeKey(node) {
  if (node.isHub)     return 'hub';
  if (node.isCategory)return 'category';
  if (node.isChild)   return 'child';
  if (node.isLeaf)    return 'leaf';
  if (node.type === 'echo-hub') return 'echo_hub';
  if (node.type === 'echo')     return 'echo';
  if (node.type === 'echo-leaf')return 'echo_leaf';
  if (node.type === 'ambient-hub') return 'ambient_hub';
  if (node.isAmbient) return 'ambient';
  return 'category';
}

function makeNodeObject(node) {
  const group      = new THREE.Group();
  const nodeColor  = new THREE.Color(node.color);
  const white      = new THREE.Color(0xffffff);
  const { inner: innerR, outer: outerR, baseOp, innerOp } = NODE_SIZES[getSizeKey(node)];
  const isDim = node.isAmbient || node.isEcho || node.isLeaf;

  // ── SPHERE GROUP (default) ────────────────────────────────────────────────
  const sphereGroup = new THREE.Group();

  const innerMat = new THREE.MeshBasicMaterial({
    color: nodeColor, transparent: isDim, opacity: isDim ? innerOp : 1.0,
  });
  sphereGroup.add(new THREE.Mesh(new THREE.SphereGeometry(innerR, 28, 28), innerMat));

  // Outer glow shell (BackSide so it reads as halo)
  const outerMat = new THREE.MeshBasicMaterial({
    color: nodeColor, transparent: true, opacity: baseOp,
    depthWrite: false, side: THREE.BackSide,
  });
  sphereGroup.add(new THREE.Mesh(new THREE.SphereGeometry(outerR, 20, 20), outerMat));

  // Second, slightly larger very-transparent halo for "bloom" effect
  if (!isDim) {
    const bloomMat = new THREE.MeshBasicMaterial({
      color: nodeColor, transparent: true, opacity: baseOp * 0.35,
      depthWrite: false, side: THREE.BackSide,
    });
    sphereGroup.add(new THREE.Mesh(new THREE.SphereGeometry(outerR * 1.7, 16, 16), bloomMat));
  }

  group.add(sphereGroup);

  // ── CRYSTAL GROUP (selected) — layered octahedron diamond ────────────────
  const crystalGroup = new THREE.Group();
  crystalGroup.visible = false;

  // Scale crystal to be clearly bigger than the sphere glow
  const crystalR  = outerR * 1.6;
  const outerGeo  = new THREE.OctahedronGeometry(crystalR, 0);
  const middleGeo = new THREE.OctahedronGeometry(crystalR * 0.72, 0);
  const innerGeo  = new THREE.OctahedronGeometry(innerR * 1.5,    0);

  // Outer shell: glassy translucent
  const outerShellMat = new THREE.MeshPhongMaterial({
    color: white, transparent: true, opacity: 0.12,
    side: THREE.DoubleSide, depthWrite: false,
    emissive: nodeColor, emissiveIntensity: 0.15,
    specular: white, shininess: 200, flatShading: true,
  });
  const outerShell = new THREE.Mesh(outerGeo, outerShellMat);
  crystalGroup.add(outerShell);

  // Outer wireframe edges — bright white
  const outerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(outerGeo),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.70 }),
  );
  crystalGroup.add(outerEdges);

  // Middle layer: tinted, semi-transparent
  const midMat = new THREE.MeshPhongMaterial({
    color: nodeColor, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false,
    emissive: nodeColor, emissiveIntensity: 0.35,
    specular: white, shininess: 120, flatShading: true,
  });
  const midMesh = new THREE.Mesh(middleGeo, midMat);
  crystalGroup.add(midMesh);

  // Middle wireframe edges — category color
  const midEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(middleGeo),
    new THREE.LineBasicMaterial({ color: nodeColor, transparent: true, opacity: 0.80 }),
  );
  crystalGroup.add(midEdges);

  // Inner core: fully solid, max emissive
  const coreMat = new THREE.MeshPhongMaterial({
    color: nodeColor, emissive: nodeColor, emissiveIntensity: 1.0,
    specular: white, shininess: 60, flatShading: true,
  });
  const coreMesh = new THREE.Mesh(innerGeo, coreMat);
  crystalGroup.add(coreMesh);

  // Core edges
  const coreEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(innerGeo),
    new THREE.LineBasicMaterial({ color: white, transparent: true, opacity: 0.95 }),
  );
  crystalGroup.add(coreEdges);

  group.add(crystalGroup);

  // Store refs for selection/animation logic
  group.userData = {
    sphereGroup, outerMat, innerMat,
    crystalGroup, outerShell, outerEdges, midMesh, midEdges, coreMesh, coreEdges,
    baseOp, innerOp, isDim,
    // Rotation phase offsets so multiple selected crystals don't sync
    rotPhase: Math.random() * Math.PI * 2,
  };

  // Entrance scale-in animation
  group.scale.setScalar(0.01);
  const t0  = Date.now(), DUR = 500;
  const tick = () => {
    const p = Math.min(1, (Date.now() - t0) / DUR);
    const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
    group.scale.setScalar(Math.max(0.01, e));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return group;
}

// ─── Icon registry ────────────────────────────────────────────────────────────
const ICONS = {
  scan: Search, alert: AlertTriangle, check: CheckCircle2, zap: Zap,
  brain: Brain, file: FileCheck, list: ListOrdered, rocket: Rocket,
  globe: Globe2, trend: TrendingUp, db: Database, cpu: Cpu,
  cash: DollarSign, users: Users, pkg: Package, shield: ShieldAlert,
  swords: Swords, radio: Radio,
};

// ─── Log sequences ────────────────────────────────────────────────────────────
const LOG_SEQ = {
  funding:    [ { icon: 'scan', text: 'Scanning Crunchbase funding database…', color: '#00e5ff' }, { icon: 'cash', text: 'Extracting funding rounds and investors…', color: '#00e5ff' }, { icon: 'check', text: 'Funding intelligence resolved.', color: '#4ade80' } ],
  people:     [ { icon: 'scan', text: 'Scanning LinkedIn company profiles…', color: '#a855f7' }, { icon: 'users', text: 'Mapping leadership and hiring signals…', color: '#a855f7' }, { icon: 'check', text: 'People intelligence resolved.', color: '#4ade80' } ],
  product:    [ { icon: 'scan', text: 'Crawling product and pricing pages…', color: '#22d3ee' }, { icon: 'pkg', text: 'Analysing feature set and positioning…', color: '#22d3ee' }, { icon: 'db', text: 'Checking G2, Capterra, review data…', color: '#22d3ee' }, { icon: 'check', text: 'Product intelligence resolved.', color: '#4ade80' } ],
  creator:    [ { icon: 'scan', text: 'Scanning creator marketplace activity…', color: '#a855f7' }, { icon: 'trend', text: 'Mapping creator–brand relationships…', color: '#a855f7' }, { icon: 'check', text: 'Creator intelligence resolved.', color: '#4ade80' } ],
  marketing:  [ { icon: 'scan', text: 'Scanning ad tooling and campaign data…', color: '#00e5ff' }, { icon: 'globe', text: 'Pulling audience engagement signals…', color: '#00e5ff' }, { icon: 'check', text: 'Marketing intelligence resolved.', color: '#4ade80' } ],
  visibility: [ { icon: 'scan', text: 'Scanning profile visibility updates…', color: '#4ade80' }, { icon: 'users', text: 'Mapping credibility signal changes…', color: '#4ade80' }, { icon: 'check', text: 'Visibility intelligence resolved.', color: '#4ade80' } ],
  b2b:        [ { icon: 'scan', text: 'Scanning B2B growth signals…', color: '#3b82f6' }, { icon: 'trend', text: 'Analysing enterprise decision-maker data…', color: '#3b82f6' }, { icon: 'check', text: 'B2B intelligence resolved.', color: '#4ade80' } ],
  threat:     [ { icon: 'shield', text: 'Running GTM threat model…', color: '#ff3b30' }, { icon: 'alert', text: 'Identifying ICP overlap and risk zones…', color: '#ff3b30' }, { icon: 'cpu', text: 'Calculating composite threat score…', color: '#ff3b30' }, { icon: 'check', text: 'Threat assessment complete.', color: '#4ade80' } ],
  move:       [ { icon: 'zap', text: 'Generating GTM counter-move playbook…', color: '#ff9500' }, { icon: 'list', text: 'Prioritising moves by revenue impact…', color: '#ff9500' }, { icon: 'swords', text: 'Finalising competitive response plan…', color: '#ff9500' }, { icon: 'file', text: 'Intel report ready.', color: '#4ade80' } ],
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── App component ────────────────────────────────────────────────────────────
export default function App() {
  const globeRef      = useRef(null);
  const logRef        = useRef(null);
  const nodeObjRef    = useRef({});
  const orbRingsRef   = useRef([]);
  const animFrRef     = useRef(null);
  const selRef        = useRef(null);
  const frameRef      = useRef(0);
  const coreCrystalRef = useRef(null); // permanent intelligence core crystal

  const [dims,         setDims]         = useState({ w: window.innerWidth, h: window.innerHeight });
  const [allNodes,     setAllNodes]     = useState(AMBIENT_NODES);
  const [rawArcs,      setRawArcs]      = useState(AMBIENT_ARCS);
  const [rings,        setRings]        = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [threatData,   setThreatData]   = useState(null);
  const [company,      setCompany]      = useState('');
  const [isRunning,    setIsRunning]    = useState(false);
  const [isDemoMode,   setIsDemoMode]   = useState(false);
  // Shared event context powers both the organizer copilot and attendee RAG.
  const [eventData,    setEventData]    = useState(null);
  const [activeView,   setActiveView]   = useState(() => {
    const h = window.location.hash.replace('#', '');
    return ['event-copilot', 'event-concierge', 'event-radar'].includes(h) ? h : 'globe';
  });
  const [logs,         setLogs]         = useState([
    { icon: 'radio', text: 'System ready — enter a competitor name to begin.', color: '#6b7280' },
  ]);

  // Sync hash to activeView
  useEffect(() => {
    const fn = () => {
      const h = window.location.hash.replace('#', '');
      setActiveView(['event-copilot', 'event-concierge', 'event-radar'].includes(h) ? h : 'globe');
    };
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);

  const switchView = (view) => {
    window.location.hash = view;
    setActiveView(view);
  };

  // Transparent globe base — wireframe sphere handles the visuals
  const globeMatRef = useRef(null);
  if (!globeMatRef.current) {
    globeMatRef.current = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0,
    });
  }

  const getNodeObj = useCallback((node) => {
    if (!nodeObjRef.current[node.id]) nodeObjRef.current[node.id] = makeNodeObject(node);
    return nodeObjRef.current[node.id];
  }, []);

  // Related IDs for the selected node (self + direct connections)
  const relatedIds = useMemo(() => {
    if (!selectedNode) return new Set();
    const s = new Set([selectedNode.id]);
    rawArcs.forEach(a => {
      if (a.fromId === selectedNode.id) s.add(a.toId);
      if (a.toId   === selectedNode.id) s.add(a.fromId);
    });
    return s;
  }, [selectedNode, rawArcs]);

  // Build display arcs from raw arc data
  const displayArcs = useMemo(() => {
    const map = new Map(allNodes.map(n => [n.id, n]));
    return rawArcs.map(arc => {
      const from = map.get(arc.fromId), to = map.get(arc.toId);
      if (!from || !to) return null;
      const hi    = !!selectedNode && (arc.fromId === selectedNode.id || arc.toId === selectedNode.id);
      const isEco = arc.type.startsWith('echo') || arc.type === 'ambient-arc';
      return {
        startLat: from.lat, startLng: from.lng,
        endLat:   to.lat,   endLng:   to.lng,
        arcType:  arc.type, nodeColor: to.color || from.color,
        isHighlighted: hi, isEco,
      };
    }).filter(Boolean);
  }, [rawArcs, allNodes, selectedNode]);

  const panelContent = selectedNode ? 'node' : (threatData ? 'threat' : 'idle');

  // ── Scene setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const scene    = globe.scene();
    const controls = globe.controls();

    setTimeout(() => globe.pointOfView({ lat: 15, lng: 5, altitude: 1.25 }, 2000), 300);

    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.30;
    controls.enableDamping   = true;
    controls.dampingFactor   = 0.07;
    controls.minDistance     = 110;
    controls.maxDistance     = 700;

    const canvas = globe.renderer().domElement;
    let resumeT  = null;
    const stopRot  = () => { controls.autoRotate = false; clearTimeout(resumeT); };
    const startRot = () => { resumeT = setTimeout(() => { controls.autoRotate = true; }, 2500); };
    canvas.addEventListener('mousedown', stopRot);
    canvas.addEventListener('touchstart', stopRot, { passive: true });
    canvas.addEventListener('mouseup', startRot);
    canvas.addEventListener('touchend', startRot);

    // ── Globe wireframe (bright, readable grid) ──────────────────────────
    const wireSphere = new THREE.Mesh(
      new THREE.SphereGeometry(101, 40, 40),
      new THREE.MeshPhongMaterial({
        color: 0x8899cc,
        wireframe: true,
        transparent: true,
        opacity: 0.38,
        emissive: new THREE.Color(0x334488),
        emissiveIntensity: 0.5,
        specular: new THREE.Color(0x7799ff),
        shininess: 80,
      }),
    );
    scene.add(wireSphere);

    // ── Lighting ─────────────────────────────────────────────────────────
    const dA = new THREE.DirectionalLight(0x99ccff, 1.4); dA.position.set(300, 200, 200); scene.add(dA);
    const dB = new THREE.DirectionalLight(0xff2d6d, 0.5); dB.position.set(-250, -100, -200); scene.add(dB);
    const dC = new THREE.DirectionalLight(0xaa88ff, 0.3); dC.position.set(0, -300, 100); scene.add(dC);
    scene.add(new THREE.AmbientLight(0x101828, 1.2));

    // ── Starfield ─────────────────────────────────────────────────────────
    const STARS = 2800;
    const sp    = new Float32Array(STARS * 3);
    const lc    = lcg(12345);
    for (let i = 0; i < STARS; i++) {
      const r = 700 + lc() * 500;
      const t = lc() * Math.PI * 2;
      const p = Math.acos(2 * lc() - 1);
      sp[i*3] = r*Math.sin(p)*Math.cos(t);
      sp[i*3+1] = r*Math.sin(p)*Math.sin(t);
      sp[i*3+2] = r*Math.cos(p);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    // Two star layers: normal + slightly bluer for depth
    const stars1 = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.60, sizeAttenuation: true }));
    const stars2 = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaabbff, size: 0.8, transparent: true, opacity: 0.35, sizeAttenuation: true }));
    scene.add(stars1, stars2);

    // ── Orbital rings ────────────────────────────────────────────────────
    orbRingsRef.current = [];
    [
      { r: 113, tube: 0.30, tilt: 0,   speed:  0.0007, color: 0x3355aa, op: 0.22 },
      { r: 121, tube: 0.22, tilt: 58,  speed: -0.0005, color: 0x6633bb, op: 0.16 },
      { r: 117, tube: 0.22, tilt: -42, speed:  0.0009, color: 0x223399, op: 0.16 },
      { r: 125, tube: 0.15, tilt: 25,  speed: -0.0004, color: 0x1144aa, op: 0.10 },
    ].forEach(({ r, tube, tilt, speed, color, op }) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, tube, 8, 128),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op }),
      );
      ring.rotation.x = tilt * Math.PI / 180;
      ring.userData.rotSpeed = speed;
      scene.add(ring);
      orbRingsRef.current.push(ring);
    });

    // ── EQUATORIAL SPLIT LINE ─────────────────────────────────────────────
    // Thin bright core ring at globe equator
    const equatorCore = new THREE.Mesh(
      new THREE.TorusGeometry(101.5, 0.45, 8, 256),
      new THREE.MeshBasicMaterial({ color: 0xffbbdd, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    // TorusGeometry default lies in the XY plane; rotate X by 90° to lay flat (equatorial = XZ plane)
    equatorCore.rotation.x = Math.PI / 2;

    // Wider soft glow halo around equator
    const equatorGlow1 = new THREE.Mesh(
      new THREE.TorusGeometry(101.5, 2.5, 8, 256),
      new THREE.MeshBasicMaterial({ color: 0xff44aa, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide }),
    );
    equatorGlow1.rotation.x = Math.PI / 2;

    const equatorGlow2 = new THREE.Mesh(
      new THREE.TorusGeometry(101.5, 6.0, 8, 256),
      new THREE.MeshBasicMaterial({ color: 0xff2266, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide }),
    );
    equatorGlow2.rotation.x = Math.PI / 2;

    // Horizontal disc plane extending beyond globe for the "beam" effect
    const equatorPlane = new THREE.Mesh(
      new THREE.RingGeometry(0, 160, 128),
      new THREE.MeshBasicMaterial({ color: 0xff2266, transparent: true, opacity: 0.018, depthWrite: false, side: THREE.DoubleSide }),
    );
    equatorPlane.rotation.x = Math.PI / 2;

    scene.add(equatorPlane, equatorGlow2, equatorGlow1, equatorCore);

    // ── PERMANENT CENTRE CRYSTAL (Intelligence Core) ──────────────────────
    const coreGroup = new THREE.Group();

    // Outermost translucent crystal shell
    const cOuterGeo  = new THREE.OctahedronGeometry(20, 0);
    const cOuterMat  = new THREE.MeshPhongMaterial({
      color: 0xffffff, transparent: true, opacity: 0.07,
      side: THREE.DoubleSide, depthWrite: false,
      emissive: new THREE.Color(0xff2d6d), emissiveIntensity: 0.18,
      specular: new THREE.Color(0xffffff), shininess: 200, flatShading: true,
    });
    const cOuterMesh = new THREE.Mesh(cOuterGeo, cOuterMat);
    const cOuterEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cOuterGeo),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }),
    );
    coreGroup.add(cOuterMesh, cOuterEdges);

    // Middle tinted layer
    const cMidGeo  = new THREE.OctahedronGeometry(13, 0);
    const cMidMat  = new THREE.MeshPhongMaterial({
      color: 0xff2d6d, transparent: true, opacity: 0.20,
      side: THREE.DoubleSide, depthWrite: false,
      emissive: new THREE.Color(0xff2d6d), emissiveIntensity: 0.5,
      specular: new THREE.Color(0xffffff), shininess: 120, flatShading: true,
    });
    const cMidMesh  = new THREE.Mesh(cMidGeo, cMidMat);
    const cMidEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cMidGeo),
      new THREE.LineBasicMaterial({ color: 0xff4499, transparent: true, opacity: 0.60 }),
    );
    coreGroup.add(cMidMesh, cMidEdges);

    // Inner solid glowing core
    const cInnerGeo  = new THREE.OctahedronGeometry(7, 0);
    const cInnerMat  = new THREE.MeshPhongMaterial({
      color: 0xff2d6d, emissive: new THREE.Color(0xff2d6d), emissiveIntensity: 2.0,
      specular: new THREE.Color(0xffffff), shininess: 60, flatShading: true,
    });
    const cInnerMesh  = new THREE.Mesh(cInnerGeo, cInnerMat);
    const cInnerEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cInnerGeo),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
    );
    coreGroup.add(cInnerMesh, cInnerEdges);

    // Ambient glow sphere around core
    const cGlowMesh = new THREE.Mesh(
      new THREE.SphereGeometry(28, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff2d6d, transparent: true, opacity: 0.055, depthWrite: false, side: THREE.BackSide }),
    );
    coreGroup.add(cGlowMesh);

    scene.add(coreGroup);
    coreCrystalRef.current = { coreGroup, cOuterMesh, cOuterEdges, cMidMesh, cMidEdges, cInnerMesh, cInnerEdges };

    // ── HEATMAP ACTIVITY PATCHES ──────────────────────────────────────────
    // Helper: lat/lng → XYZ on globe surface
    function latLngToXYZ(lat, lng, radius) {
      const phi   = (90 - lat)  * Math.PI / 180;
      const theta = (lng + 180) * Math.PI / 180;
      return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
         radius * Math.cos(phi),
         radius * Math.sin(phi) * Math.sin(theta),
      );
    }

    // Hotspot zones: {lat, lng, density, intensity}
    const HOTSPOTS = [
      { lat:  10, lng:   0, density: 120, intensity: 1.00 }, // primary — front centre
      { lat:  35, lng: -80, density:  90, intensity: 0.85 }, // North America
      { lat:  55, lng:  40, density:  80, intensity: 0.80 }, // Europe/Russia
      { lat: -10, lng: 120, density:  85, intensity: 0.82 }, // Southeast Asia
      { lat:  30, lng: 115, density:  75, intensity: 0.75 }, // China
      { lat: -25, lng: -45, density:  65, intensity: 0.68 }, // South America
      { lat:  20, lng:  80, density:  70, intensity: 0.72 }, // India
      { lat:  60, lng: -10, density:  60, intensity: 0.65 }, // North Atlantic
      { lat: -35, lng:  25, density:  55, intensity: 0.60 }, // Southern Africa
      { lat: -50, lng: 150, density:  50, intensity: 0.55 }, // Australia/Pacific
      { lat:  45, lng: -120,density:  70, intensity: 0.70 }, // Pacific Northwest
      { lat:  0,  lng: -30, density:  45, intensity: 0.50 }, // Mid-Atlantic
    ];

    const heatmapObjects = [];
    const heatRand = lcg(99999);

    HOTSPOTS.forEach(({ lat, lng, density, intensity }) => {
      const centre = latLngToXYZ(lat, lng, 101.5);
      const normal = centre.clone().normalize();

      // Tangent vectors for spreading particles on surface
      const up  = new THREE.Vector3(0, 1, 0);
      const tan = new THREE.Vector3().crossVectors(normal, up).normalize();
      const bin = new THREE.Vector3().crossVectors(normal, tan).normalize();

      // Particle cluster
      const pCount = density;
      const pPos   = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount; i++) {
        const angle  = heatRand() * Math.PI * 2;
        // Non-uniform spread: more particles near centre
        const radius = Math.pow(heatRand(), 0.5) * 24;
        const lift   = heatRand() * 3; // slightly above surface
        const x = centre.x + (Math.cos(angle) * tan.x + Math.sin(angle) * bin.x) * radius + normal.x * lift;
        const y = centre.y + (Math.cos(angle) * tan.y + Math.sin(angle) * bin.y) * radius + normal.y * lift;
        const z = centre.z + (Math.cos(angle) * tan.z + Math.sin(angle) * bin.z) * radius + normal.z * lift;
        pPos[i * 3]     = x;
        pPos[i * 3 + 1] = y;
        pPos[i * 3 + 2] = z;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
      const pMat = new THREE.PointsMaterial({
        color: new THREE.Color(0xff2d6d),
        size: 1.0 + intensity * 1.2,
        transparent: true,
        opacity: 0.30 * intensity,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(pGeo, pMat);
      scene.add(points);
      heatmapObjects.push(points);

      // Radial glow disc on surface
      const glowGeo = new THREE.CircleGeometry(18 * intensity, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff2d6d, transparent: true, opacity: 0.06 * intensity,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const glowDisc = new THREE.Mesh(glowGeo, glowMat);
      // Orient disc to face outward from globe surface
      glowDisc.position.copy(centre);
      glowDisc.lookAt(centre.clone().multiplyScalar(2));
      scene.add(glowDisc);
      heatmapObjects.push(glowDisc);

      // Mini starburst streaks
      const streakCount = Math.floor(density * 0.25);
      for (let si = 0; si < streakCount; si++) {
        const sAngle  = heatRand() * Math.PI * 2;
        const sLen    = 4 + heatRand() * 14;
        const sRadius = heatRand() * 20;
        const sx1 = centre.x + (Math.cos(sAngle) * tan.x + Math.sin(sAngle) * bin.x) * sRadius;
        const sy1 = centre.y + (Math.cos(sAngle) * tan.y + Math.sin(sAngle) * bin.y) * sRadius;
        const sz1 = centre.z + (Math.cos(sAngle) * tan.z + Math.sin(sAngle) * bin.z) * sRadius;
        const endAngle = sAngle + (heatRand() - 0.5) * 0.6;
        const sx2 = sx1 + (Math.cos(endAngle) * tan.x + Math.sin(endAngle) * bin.x) * sLen;
        const sy2 = sy1 + (Math.cos(endAngle) * tan.y + Math.sin(endAngle) * bin.y) * sLen;
        const sz2 = sz1 + (Math.cos(endAngle) * tan.z + Math.sin(endAngle) * bin.z) * sLen;
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute('position', new THREE.Float32BufferAttribute([sx1, sy1, sz1, sx2, sy2, sz2], 3));
        const streak = new THREE.Line(sGeo,
          new THREE.LineBasicMaterial({
            color: 0xff4499, transparent: true,
            opacity: 0.12 * intensity * heatRand(),
            depthWrite: false, blending: THREE.AdditiveBlending,
          }),
        );
        scene.add(streak);
        heatmapObjects.push(streak);
      }
    });

    return () => {
      scene.remove(
        wireSphere, dA, dB, dC, stars1, stars2,
        equatorPlane, equatorGlow2, equatorGlow1, equatorCore,
        coreGroup,
        ...orbRingsRef.current,
        ...heatmapObjects,
      );
      canvas.removeEventListener('mousedown', stopRot);
      canvas.removeEventListener('touchstart', stopRot);
      canvas.removeEventListener('mouseup', startRot);
      canvas.removeEventListener('touchend', startRot);
      clearTimeout(resumeT);
    };
  }, []);

  // ── Animation RAF ─────────────────────────────────────────────────────────
  useEffect(() => {
    const animate = () => {
      frameRef.current++;
      const t = frameRef.current;

      // Rotate selected crystal components counter-rotating layers
      if (selRef.current && nodeObjRef.current[selRef.current.id]) {
        const grp = nodeObjRef.current[selRef.current.id];
        const ud  = grp.userData;
        if (ud.crystalGroup?.visible) {
          ud.outerShell.rotation.y += 0.007;
          ud.outerShell.rotation.x += 0.004;
          ud.outerEdges.rotation.copy(ud.outerShell.rotation);
          ud.midMesh.rotation.y   -= 0.011;
          ud.midMesh.rotation.z   += 0.006;
          ud.midEdges.rotation.copy(ud.midMesh.rotation);
          ud.coreMesh.rotation.y  += 0.015;
          ud.coreMesh.rotation.x  -= 0.009;
          ud.coreEdges.rotation.copy(ud.coreMesh.rotation);
        }
      }

      // Orbital rings
      orbRingsRef.current.forEach(r => { r.rotation.z += r.userData.rotSpeed; });

      // Centre crystal — slow counter-rotating layers
      if (coreCrystalRef.current) {
        const cc = coreCrystalRef.current;
        cc.cOuterMesh.rotation.y  += 0.0025;
        cc.cOuterMesh.rotation.x  += 0.0015;
        cc.cOuterEdges.rotation.copy(cc.cOuterMesh.rotation);
        cc.cMidMesh.rotation.y    -= 0.0038;
        cc.cMidMesh.rotation.z    += 0.0020;
        cc.cMidEdges.rotation.copy(cc.cMidMesh.rotation);
        cc.cInnerMesh.rotation.y  += 0.0055;
        cc.cInnerMesh.rotation.x  -= 0.0030;
        cc.cInnerEdges.rotation.copy(cc.cInnerMesh.rotation);
      }

      animFrRef.current = requestAnimationFrame(animate);
    };
    animFrRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrRef.current);
  }, []);

  // ── Resize ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  // ── Log scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // ── Selection: stateful geometry swap + dimming ───────────────────────────
  useEffect(() => {
    Object.entries(nodeObjRef.current).forEach(([id, grp]) => {
      const ud = grp.userData;
      if (!ud) return;
      const { sphereGroup, crystalGroup, outerMat, innerMat, baseOp, innerOp, isDim } = ud;

      const isSelected   = selectedNode && id === selectedNode.id;
      const isRelated    = !isSelected && relatedIds.has(id);
      const isEcho       = grp.userData.isDim; // reuse isDim flag as proxy for non-primary nodes

      if (!selectedNode) {
        // Full reset
        if (crystalGroup.visible) { sphereGroup.visible = true; crystalGroup.visible = false; }
        animSc(grp, 1.0, 350);
        animOp(outerMat, baseOp, 250);
        if (innerMat && isDim) animOp(innerMat, innerOp, 250);

      } else if (isSelected) {
        // → Crystal
        if (!crystalGroup.visible) {
          sphereGroup.visible = false;
          crystalGroup.visible = true;
          grp.scale.setScalar(0.4); // jump from small before animating up
        }
        animSc(grp, 2.2, 450);

      } else if (isRelated) {
        if (crystalGroup.visible) { sphereGroup.visible = true; crystalGroup.visible = false; }
        animSc(grp, 1.35, 300);
        animOp(outerMat, Math.min(baseOp * 2.0, 0.7), 250);

      } else {
        // Unrelated: dim
        if (crystalGroup.visible) { sphereGroup.visible = true; crystalGroup.visible = false; }
        animSc(grp, isDim ? 0.6 : 0.75, 300);
        animOp(outerMat, isDim ? baseOp * 0.15 : baseOp * 0.18, 250);
        if (innerMat && isDim) animOp(innerMat, innerOp * 0.25, 250);
      }
    });

    if (selectedNode && globeRef.current) {
      globeRef.current.pointOfView(
        { lat: selectedNode.lat, lng: selectedNode.lng, altitude: 1.35 }, 900,
      );
    }
  }, [selectedNode, relatedIds]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const addLog = useCallback((icon, text, color = '#8899aa') => {
    setLogs(prev => [...prev.slice(-120), { icon, text, color }]);
  }, []);

  const selectNode = useCallback((node) => {
    selRef.current = node;
    setSelectedNode(node);
  }, []);

  const handleNodeClick = useCallback((nodeData) => {
    if (!nodeData || nodeData.isAmbient || nodeData.isEcho) return;
    if (selRef.current?.id === nodeData.id) selectNode(null);
    else selectNode(nodeData);
  }, [selectNode]);

  // ── Progressive reveal ────────────────────────────────────────────────────
  const revealCluster = useCallback(async (clusterId, categories, clusterNodes, clusterArcs) => {
    const hub = clusterNodes.find(n => n.isHub);
    setAllNodes(p => [...p, hub]);
    await delay(250);

    for (const cat of categories) {
      const catNode = clusterNodes.find(n => n.id === `${clusterId}-${cat.id}`);
      if (!catNode) continue;

      setRings([{ lat: catNode.lat, lng: catNode.lng, maxR: 8, propagationSpeed: 3, repeatPeriod: 900, color: catNode.color }]);

      const seq = LOG_SEQ[cat.type] || LOG_SEQ.product;
      for (const e of seq) { addLog(e.icon, e.text, e.color); await delay(380 + Math.random() * 200); }

      setAllNodes(p => [...p, catNode]);
      const hubArc = clusterArcs.find(a => a.fromId === hub.id && a.toId === catNode.id);
      if (hubArc) setRawArcs(p => [...p, hubArc]);

      await delay(100);

      // Children
      const children = clusterNodes.filter(n => n.parentId === catNode.id && !n.isLeaf);
      for (const ch of children) {
        setAllNodes(p => [...p, ch]);
        const ca = clusterArcs.find(a => a.fromId === catNode.id && a.toId === ch.id);
        if (ca) setRawArcs(p => [...p, ca]);
        await delay(50);
      }

      // Leaves
      const leaves = clusterNodes.filter(n => n.parentId === catNode.id && n.isLeaf);
      for (const lf of leaves) {
        setAllNodes(p => [...p, lf]);
        const la = clusterArcs.find(a => a.fromId === catNode.id && a.toId === lf.id);
        if (la) setRawArcs(p => [...p, la]);
        await delay(30);
      }

      await delay(250);
    }
    setRings([]);
  }, [addLog]);

  // ── LinkedIn demo ─────────────────────────────────────────────────────────
  const runLinkedIn = useCallback(async () => {
    setIsDemoMode(true);
    nodeObjRef.current = {};
    selectNode(null);

    const { nodes, arcs } = computeClusterNodes('linkedin', { lat: 10, lng: 0 }, LINKEDIN_CATEGORIES, 42);
    nodes[0].label = 'LinkedIn';

    // Build echo clusters from LinkedIn data
    const { nodes: echoNodes, arcs: echoArcs } = buildEchoClusters(nodes, arcs, LINKEDIN_CATEGORIES, 199);

    setAllNodes([...AMBIENT_NODES, ...echoNodes]);
    setRawArcs([...AMBIENT_ARCS, ...echoArcs]);
    setThreatData(null);
    addLog('rocket', 'Initiating LinkedIn intelligence sweep…', '#ff4d6d');

    await delay(350);
    await revealCluster('linkedin', LINKEDIN_CATEGORIES, nodes, arcs);

    addLog('brain', 'Claude Sonnet synthesising intelligence…', '#a855f7');
    await delay(1200);
    setThreatData(LINKEDIN_THREAT);
    addLog('file', 'LinkedIn intelligence report ready.', '#4ade80');
    setIsRunning(false);
  }, [addLog, selectNode, revealCluster]);

  // ── Generic demo ─────────────────────────────────────────────────────────
  const runGenericDemo = useCallback(async (name) => {
    setIsDemoMode(true);
    nodeObjRef.current = {};
    selectNode(null);

    const { nodes, arcs } = computeClusterNodes(name.toLowerCase(), { lat: 10, lng: 0 }, GENERIC_CATEGORIES, 77);
    nodes[0].label = name.toUpperCase();

    const { nodes: echoNodes, arcs: echoArcs } = buildEchoClusters(nodes, arcs, GENERIC_CATEGORIES, 321);

    setAllNodes([...AMBIENT_NODES, ...echoNodes]);
    setRawArcs([...AMBIENT_ARCS, ...echoArcs]);
    setThreatData(null);
    addLog('rocket', `Initiating intel sweep on ${name}…`, '#ff4d6d');

    await delay(350);
    await revealCluster(name.toLowerCase(), GENERIC_CATEGORIES, nodes, arcs);

    addLog('brain', 'Claude Sonnet synthesising intelligence…', '#a855f7');
    await delay(1200);
    setThreatData({
      level: 'AMBER',
      brief: `${name} is executing a multi-front GTM expansion. Revenue velocity is accelerating across core segments with new bundling plays that directly threaten your ICP.`,
      moves: [
        'Deploy head-to-head battle card to top 10 at-risk accounts this week.',
        'Sharpen differentiation with cross-platform integrations they cannot replicate.',
        'Accelerate roadmap items closing the most critical feature gaps in your ICP.',
      ],
    });
    addLog('file', 'Intel report ready.', '#4ade80');
    setIsRunning(false);
  }, [addLog, selectNode, revealCluster]);

  const handleAnalyse = useCallback(async () => {
    if (!company.trim() || isRunning) return;
    setIsRunning(true);
    if (company.trim().toLowerCase() === 'linkedin') { await runLinkedIn(); return; }
    try {
      await axios.get('http://localhost:8000/health', { timeout: 2000 });
      await runGenericDemo(company.trim());
    } catch {
      await runGenericDemo(company.trim());
    }
  }, [company, isRunning, runLinkedIn, runGenericDemo]);

  const threatColor = { RED: '#ff3b30', AMBER: '#ff9500', GREEN: '#34c759' }[threatData?.level] ?? '#4ade80';

  // ── Arc color function ────────────────────────────────────────────────────
  const arcColorFn = useCallback((d) => {
    if (d.isHighlighted) {
      return [`rgba(255,255,255,0.30)`, d.nodeColor + 'dd'];
    }
    if (d.isEco) {
      return [`rgba(255,255,255,0.0)`, d.nodeColor + (selectedNode ? '09' : '1a')];
    }
    // Primary cluster arcs
    return [
      `rgba(255,255,255,0.01)`,
      d.nodeColor + (selectedNode ? '25' : '77'),
    ];
  }, [selectedNode]);

  const arcStrokeFn = useCallback((d) => {
    if (d.isHighlighted)          return 0.12;
    if (d.arcType === 'hub-cat')  return 0.10;
    if (d.arcType === 'cat-child')return 0.04;
    if (d.arcType === 'cat-leaf') return 0.02;
    if (d.arcType === 'echo-arc') return 0.03;
    return 0.015;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-root">
      <ErrorBoundary>
      <GlobeGL
        ref={globeRef}
        width={dims.w}
        height={dims.h}
        backgroundColor="rgba(0,0,0,0)"
        showGlobe={true}
        globeMaterial={globeMatRef.current}
        atmosphereColor="#ff4d6d"
        atmosphereAltitude={0.10}
        globeImageUrl={null}
        showAtmosphere={true}

        /* Nodes */
        objectsData={allNodes}
        objectLat="lat"
        objectLng="lng"
        objectAltitude="alt"
        objectLabel="label"
        objectThreeObject={getNodeObj}
        onObjectClick={handleNodeClick}

        /* Connection lines */
        arcsData={displayArcs}
        arcStartLat="startLat"
        arcStartLng="startLng"
        arcEndLat="endLat"
        arcEndLng="endLng"
        arcColor={arcColorFn}
        arcStroke={arcStrokeFn}
        arcAltitudeAutoScale={0.22}
        arcDashLength={0.35}
        arcDashGap={0.18}
        arcDashAnimateTime={3200}

        /* Pulse rings */
        ringsData={rings}
        ringLat="lat"
        ringLng="lng"
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        ringColor={d => t => `${d.color}${Math.round((1 - t) * 255).toString(16).padStart(2, '0')}`}
        ringAltitude={0.005}
      />
      </ErrorBoundary>

      {/* ── Top bar ── */}
      <div className="topbar">
        <div className="topbar-logo">
          <span className="logo-icon">◎</span>
          <span className="logo-text">OutPace HQ</span>
        </div>

        {/* Nav tabs */}
        <div className="nav-tabs">
          <button
            className={`nav-tab${activeView === 'globe' ? ' nav-tab--active' : ''}`}
            onClick={() => switchView('globe')}
            id="nav-tab-globe"
          >
            <Globe2 size={13} />
            Intelligence
          </button>
          <button
            className={`nav-tab${activeView === 'event-radar' ? ' nav-tab--active' : ''}`}
            onClick={() => switchView('event-radar')}
            id="nav-tab-event-radar"
          >
            <ShieldAlert size={13} />
            Luma Events
          </button>
          <button
            className={`nav-tab${activeView === 'event-copilot' ? ' nav-tab--active' : ''}`}
            onClick={() => switchView('event-copilot')}
            id="nav-tab-event-copilot"
          >
            <Cpu size={13} />
            Luma Copilot
          </button>
          <button
            className={`nav-tab${activeView === 'event-concierge' ? ' nav-tab--active' : ''}`}
            onClick={() => switchView('event-concierge')}
            id="nav-tab-event-concierge"
          >
            <MessageCircle size={13} />
            Ask Event
          </button>
        </div>

        <div className="topbar-search">
          <input
            className="company-input"
            type="text"
            placeholder='Enter competitor name (try "linkedin")…'
            value={company}
            onChange={e => setCompany(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAnalyse()}
            disabled={isRunning}
            autoComplete="off"
          />
          <button
            className={`analyse-btn${isRunning ? ' running' : ''}`}
            onClick={handleAnalyse}
            disabled={isRunning || !company.trim()}
          >
            {isRunning ? <><span className="spinner" />&nbsp;Scanning…</> : 'Analyse'}
          </button>
        </div>
        <div className="topbar-tagline">
          {isDemoMode && <span className="demo-badge">DEMO</span>}
          <span className="tagline-text">GTM Intelligence Platform</span>
        </div>
      </div>

      {/* ── Event Radar view ── */}
      {activeView === 'event-radar' && (
        <EventRadarPage company={company} />
      )}

      {/* ── Event Copilot view ── */}
      {activeView === 'event-copilot' && (
        <EventCopilotPage eventData={eventData} onEventCreated={setEventData} />
      )}

      {/* ── Attendee FAQ / RAG concierge view ── */}
      {activeView === 'event-concierge' && (
        <div className="ec-root">
          <div className="ec-content">
            <ConciergeChat eventData={eventData} />
          </div>
        </div>
      )}

      {/* ── Left panel: agent log (globe view only) ── */}
      <div className="panel panel-left" style={{ display: activeView === 'globe' ? 'flex' : 'none' }}>
        <div className="panel-header">
          <span className="panel-dot pulse-dot" />
          AGENT LOG
        </div>
        <div className="log-scroll" ref={logRef}>
          {logs.map((e, i) => <LogLine key={i} entry={e} />)}
        </div>
      </div>

      {/* ── Right panel (globe view only) ── */}
      {activeView === 'globe' && (
        <RightPanel
          mode={panelContent}
          threatData={threatData}
          selectedNode={selectedNode}
          threatColor={threatColor}
          onClose={() => selectNode(null)}
        />
      )}

      {/* ── Legend (globe view only) ── */}
      {activeView === 'globe' && (
        <div className="legend">
          {[
            { label: 'HUB',       color: C.hub,        Icon: Target      },
            { label: 'PRODUCT',   color: C.product,    Icon: Package     },
            { label: 'CREATOR',   color: C.creator,    Icon: Users       },
            { label: 'MARKETING', color: C.marketing,  Icon: TrendingUp  },
            { label: 'THREAT',    color: C.threat,     Icon: ShieldAlert },
            { label: 'MOVE',      color: C.move,       Icon: Swords      },
          ].map(({ label, color, Icon }) => (
            <div key={label} className="legend-item">
              <span className="legend-dot" style={{ background: color }} />
              <Icon size={11} style={{ color }} />
              <span className="legend-label" style={{ color: `${color}bb` }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LogLine ──────────────────────────────────────────────────────────────────
function LogLine({ entry }) {
  const IconComp = ICONS[entry.icon] ?? Radio;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="log-line">
      <span className="log-time">{time}</span>
      <span className="log-icon" style={{ color: entry.color }}><IconComp size={12} /></span>
      <span className="log-text" style={{ color: entry.color }}>{entry.text}</span>
    </div>
  );
}

// ─── RightPanel ───────────────────────────────────────────────────────────────
function RightPanel({ mode, threatData, selectedNode, threatColor, onClose }) {
  if (mode === 'idle') return null;
  return (
    <div className={`panel panel-right${mode === 'node' ? ' panel-node' : ''}`}>
      {mode === 'threat' && threatData && (
        <>
          <div className="panel-header">
            <span className="panel-dot" style={{ background: threatColor }} />
            THREAT BRIEF
          </div>
          <div className="threat-level-row">
            <span className="threat-badge" style={{ borderColor: threatColor, color: threatColor }}>
              {threatData.level}
            </span>
            <span className="threat-hint">Click any node to inspect</span>
          </div>
          <p className="threat-brief-text">{threatData.brief}</p>
          <div className="gtm-section">
            <div className="gtm-label">GTM COUNTER-MOVES</div>
            <ul className="gtm-list">
              {threatData.moves.map((m, i) => (
                <li key={i} className="gtm-item">
                  <Zap size={11} style={{ color: '#ff9500', flexShrink: 0, marginTop: 2 }} />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {mode === 'node' && selectedNode && (
        <>
          <div className="panel-header">
            <span className="panel-dot" style={{ background: selectedNode.color }} />
            NODE DETAIL
            <button className="panel-close" onClick={onClose}><X size={12} /></button>
          </div>
          <div className="node-detail-top">
            <span className="node-type-badge" style={{ borderColor: selectedNode.color, color: selectedNode.color }}>
              {(selectedNode.type || 'node').toUpperCase()}
            </span>
            <h3 className="node-title">{selectedNode.label}</h3>
          </div>
          {selectedNode.description && <p className="node-description">{selectedNode.description}</p>}
          {selectedNode.insights?.length > 0 && (
            <div className="node-insights">
              <div className="gtm-label">KEY INSIGHTS</div>
              <ul className="insight-list">
                {selectedNode.insights.map((ins, i) => (
                  <li key={i} className="insight-item">
                    <ChevronRight size={11} style={{ color: selectedNode.color, flexShrink: 0, marginTop: 2 }} />
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {selectedNode.impact != null && (
            <div className="impact-section">
              <div className="gtm-label">IMPACT SCORE</div>
              <div className="impact-bar-wrap">
                <div
                  className="impact-bar"
                  style={{
                    width: `${selectedNode.impact}%`,
                    background: `linear-gradient(90deg, ${selectedNode.color}55, ${selectedNode.color})`,
                  }}
                />
              </div>
              <span className="impact-score" style={{ color: selectedNode.color }}>
                {selectedNode.impact}<span style={{ color: '#6b7280', fontSize: 10 }}>/100</span>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
