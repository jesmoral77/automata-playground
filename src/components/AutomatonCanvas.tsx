"use client";

import cytoscape, { Core, ElementDefinition, StylesheetJson } from "cytoscape";
import { useEffect, useRef } from "react";
import { Automaton, EPSILON, groupEdges, Transition } from "@/lib/automata";

export type Selection =
  | { kind: "state"; id: string }
  | { kind: "edge"; from: string; to: string }
  | null;

export interface Highlight {
  active: string[];
  taken: Transition[];
}

interface Props {
  machine: Automaton;
  highlight?: Highlight | null;
  selection?: Selection;
  /** State waiting to be the source of a new transition. */
  pendingFrom?: string | null;
  /** Read-only canvases can still be panned/zoomed and nodes dragged locally. */
  readOnly?: boolean;
  /** Changing this value re-fits the view (e.g. when a different machine is loaded). */
  fitKey?: string | number;
  onBackgroundTap?: (x: number, y: number) => void;
  onNodeTap?: (id: string) => void;
  onEdgeTap?: (from: string, to: string) => void;
  onNodeMoved?: (id: string, x: number, y: number) => void;
  /** Called with positions after states lacking x/y were auto-laid-out. */
  onAutoLayout?: (positions: Record<string, { x: number; y: number }>) => void;
  /** Exposes the Cytoscape instance (for fit / re-layout buttons). */
  onReady?: (cy: Core) => void;
  className?: string;
}

const START_ID = "__start";
const START_OFFSET = 70;

const STYLE: StylesheetJson = [
  {
    selector: "node",
    style: {
      width: 52,
      height: 52,
      "background-color": "#ffffff",
      "border-width": 2,
      "border-color": "#334155",
      label: "data(label)",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 14,
      "font-family": "ui-sans-serif, system-ui, sans-serif",
      color: "#0f172a",
      "text-wrap": "wrap",
      "text-max-width": "120px",
      "transition-property": "background-color, border-color",
      "transition-duration": 150,
    },
  },
  { selector: "node.wide", style: { shape: "round-rectangle", width: "label", "padding-left": "10px", "padding-right": "10px" } as never },
  { selector: "node.accepting", style: { "border-style": "double", "border-width": 7 } },
  { selector: "node.active", style: { "background-color": "#fde68a", "border-color": "#b45309" } },
  { selector: "node.pending", style: { "background-color": "#dbeafe", "border-color": "#2563eb" } },
  { selector: "node.selected", style: { "border-color": "#2563eb", "overlay-color": "#2563eb", "overlay-opacity": 0.12, "overlay-padding": 6 } },
  {
    selector: `node#${START_ID}`,
    style: { width: 1, height: 1, opacity: 0, label: "", events: "no" },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "control-point-step-size": 44,
      "target-arrow-shape": "triangle",
      "arrow-scale": 1.2,
      width: 2,
      "line-color": "#64748b",
      "target-arrow-color": "#64748b",
      label: "data(label)",
      "font-size": 14,
      "font-family": "ui-monospace, monospace",
      color: "#0f172a",
      "text-background-color": "#ffffff",
      "text-background-opacity": 1,
      "text-background-padding": "2px",
      "loop-direction": "0deg",
      "loop-sweep": "-50deg",
      "text-margin-y": -2,
    },
  },
  { selector: "edge.taken", style: { "line-color": "#d97706", "target-arrow-color": "#d97706", width: 3.5 } },
  { selector: "edge.selected", style: { "line-color": "#2563eb", "target-arrow-color": "#2563eb", width: 3 } },
  { selector: `edge#${START_ID}-edge`, style: { label: "", "line-color": "#334155", "target-arrow-color": "#334155", events: "no" } },
];

function edgeId(from: string, to: string) {
  return `e:${from}->${to}`;
}

function buildElements(m: Automaton, props: Props): ElementDefinition[] {
  const accepting = new Set(m.accepting);
  const active = new Set(props.highlight?.active ?? []);
  const taken = new Set((props.highlight?.taken ?? []).map((t) => edgeId(t.from, t.to)));
  const sel = props.selection;
  const els: ElementDefinition[] = [];

  for (const s of m.states) {
    const classes = [
      accepting.has(s.id) && "accepting",
      active.has(s.id) && "active",
      props.pendingFrom === s.id && "pending",
      sel?.kind === "state" && sel.id === s.id && "selected",
      s.label.length > 4 && "wide",
    ].filter(Boolean);
    els.push({
      group: "nodes",
      data: { id: s.id, label: s.label },
      position: s.x !== undefined && s.y !== undefined ? { x: s.x, y: s.y } : undefined,
      classes: classes.join(" "),
    });
  }

  for (const e of groupEdges(m)) {
    const id = edgeId(e.from, e.to);
    const symbols = [...e.symbols].sort((a, b) => (a === EPSILON ? 1 : b === EPSILON ? -1 : a.localeCompare(b)));
    const classes = [
      taken.has(id) && "taken",
      sel?.kind === "edge" && sel.from === e.from && sel.to === e.to && "selected",
    ].filter(Boolean);
    els.push({
      group: "edges",
      data: { id, source: e.from, target: e.to, label: symbols.join(", ") },
      classes: classes.join(" "),
    });
  }
  return els;
}

/** Place the invisible start-arrow node to the left of the start state. */
function syncStartArrow(cy: Core, m: Automaton) {
  cy.getElementById(START_ID).remove();
  if (!m.start) return;
  const start = cy.getElementById(m.start);
  if (start.empty()) return;
  const p = start.position();
  cy.add([
    { group: "nodes", data: { id: START_ID }, position: { x: p.x - START_OFFSET, y: p.y }, grabbable: false, selectable: false },
    { group: "edges", data: { id: `${START_ID}-edge`, source: START_ID, target: m.start } },
  ]);
}

export default function AutomatonCanvas(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const propsRef = useRef(props);
  const lastFitKey = useRef<string | number | undefined>(undefined);

  useEffect(() => {
    propsRef.current = props;
  });

  // Create the Cytoscape instance once.
  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: STYLE,
      elements: [],
      minZoom: 0.2,
      maxZoom: 3,
      boxSelectionEnabled: false,
      selectionType: "single",
      autounselectify: true,
    });
    cyRef.current = cy;

    cy.on("tap", (evt) => {
      if (evt.target === cy) propsRef.current.onBackgroundTap?.(evt.position.x, evt.position.y);
    });
    cy.on("tap", "node", (evt) => {
      const id = evt.target.id();
      if (id !== START_ID) propsRef.current.onNodeTap?.(id);
    });
    cy.on("tap", "edge", (evt) => {
      const e = evt.target;
      if (e.id() !== `${START_ID}-edge`) propsRef.current.onEdgeTap?.(e.source().id(), e.target().id());
    });
    // Keep the start arrow attached while dragging the start state.
    cy.on("drag", "node", (evt) => {
      const m = propsRef.current.machine;
      if (evt.target.id() === m.start) {
        const p = evt.target.position();
        cy.getElementById(START_ID).position({ x: p.x - START_OFFSET, y: p.y });
      }
    });
    cy.on("dragfree", "node", (evt) => {
      const p = evt.target.position();
      propsRef.current.onNodeMoved?.(evt.target.id(), Math.round(p.x), Math.round(p.y));
    });

    propsRef.current.onReady?.(cy);
    return () => cy.destroy();
  }, []);

  // Sync elements whenever the machine or highlighting changes.
  const { machine, highlight, selection, pendingFrom, fitKey, readOnly } = props;
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // Keep positions of nodes that the user dragged in a read-only view.
    const previous = new Map(cy.nodes().map((n) => [n.id(), { ...n.position() }]));
    cy.batch(() => {
      cy.elements().remove();
      cy.add(buildElements(machine, propsRef.current));
    });
    cy.nodes().forEach((n) => {
      n.grabify();
      if (readOnly && previous.has(n.id())) n.position(previous.get(n.id())!);
    });

    const unplaced = machine.states.filter((s) => s.x === undefined || s.y === undefined);
    const needsLayout = unplaced.length > 0 && !(readOnly && unplaced.every((s) => previous.has(s.id)));
    if (needsLayout) {
      cy.layout({
        name: "breadthfirst",
        directed: true,
        roots: machine.start ? [machine.start] : undefined,
        spacingFactor: 1.4,
        padding: 40,
        animate: false,
        transform: (_node, pos) => ({ x: pos.y, y: pos.x }), // left-to-right instead of top-down
      } as cytoscape.LayoutOptions).run();
      const positions: Record<string, { x: number; y: number }> = {};
      cy.nodes().forEach((n) => {
        positions[n.id()] = { x: Math.round(n.position().x), y: Math.round(n.position().y) };
      });
      propsRef.current.onAutoLayout?.(positions);
    }
    syncStartArrow(cy, machine);

    if (needsLayout || fitKey !== lastFitKey.current) {
      lastFitKey.current = fitKey;
      if (machine.states.length > 0) cy.fit(undefined, 50);
      if (cy.zoom() > 1.3) {
        cy.zoom(1.3);
        cy.center();
      }
    }
  }, [machine, highlight, selection, pendingFrom, fitKey, readOnly]);

  return <div ref={containerRef} className={props.className ?? "h-full w-full"} />;
}
