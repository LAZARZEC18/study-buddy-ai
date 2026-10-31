// A hand-written study set so anyone can try every feature without an API key.
import { today } from "./srs.js";

export const EXAMPLE_ID = "example-ohms-kirchhoff";

export const EXAMPLE_NOTES = `ELEN week 3: Ohm's law and Kirchhoff's laws

Ohm's law
- For a resistor, voltage across it is proportional to current through it: V = IR
- V in volts (V), I in amps (A), R in ohms (Ω)
- Rearranged: I = V/R, R = V/I
- Only holds for "ohmic" components (fixed resistors at constant temp). A diode or a filament lamp is non-ohmic, so its I-V graph isn't a straight line.
- Power dissipated in a resistor: P = VI = I^2 R = V^2 / R (watts)

Series and parallel
- Series: same current through each, R_total = R1 + R2 + ...
- Parallel: same voltage across each, 1/R_total = 1/R1 + 1/R2 + ...
- Two in parallel shortcut: R1 R2 / (R1 + R2)
- Parallel total is always smaller than the smallest resistor

Kirchhoff's current law (KCL)
- At any node, total current in = total current out. Sum of currents at a node = 0
- Comes from conservation of charge (charge can't pile up at a node)

Kirchhoff's voltage law (KVL)
- Around any closed loop, the sum of voltage rises = sum of voltage drops. Sum of voltages around a loop = 0
- Comes from conservation of energy
- Sign convention: pick a direction around the loop, rise going - to + through a source, drop going with the current through a resistor

Voltage divider (two resistors in series across Vs):
Vout = Vs * R2 / (R1 + R2)

Example from the tute: 12 V source, R1 = 4 Ω and R2 = 2 Ω in series. R_total = 6 Ω so I = 2 A. V across R1 = 8 V, across R2 = 4 V. 8 + 4 = 12 so KVL checks out.`;

const SUMMARY = {
  overview: "Three rules solve almost any DC resistor circuit. Ohm's law links voltage, current and resistance in one component; Kirchhoff's laws describe how current splits at a junction and how voltage is shared around a loop.",
  sections: [
    {
      heading: "Ohm's law and power",
      points: [
        "For an ohmic resistor, $V = IR$, which rearranges to $I = \\frac{V}{R}$ and $R = \\frac{V}{I}$.",
        "It only holds when the $I$–$V$ graph is a straight line through the origin, so diodes and filament lamps don't follow it.",
        "A resistor turns electrical energy into heat at $P = VI = I^2 R = \\frac{V^2}{R}$ watts.",
      ],
    },
    {
      heading: "Series and parallel",
      points: [
        "Series resistors carry the same current and add directly: $R_T = R_1 + R_2 + \\dots$",
        "Parallel resistors share the same voltage and add as reciprocals: $\\frac{1}{R_T} = \\frac{1}{R_1} + \\frac{1}{R_2} + \\dots$",
        "For two in parallel, $R_T = \\frac{R_1 R_2}{R_1 + R_2}$, always smaller than the smaller resistor.",
      ],
    },
    {
      heading: "Kirchhoff's laws",
      points: [
        "KCL: currents at any node sum to zero, $\\sum I = 0$, because charge is conserved.",
        "KVL: voltages around any closed loop sum to zero, $\\sum V = 0$, because energy is conserved.",
        "Pick one direction around the loop and keep one sign convention throughout.",
      ],
    },
    {
      heading: "Voltage divider",
      points: [
        "Two series resistors across $V_s$ give $V_{out} = V_s \\frac{R_2}{R_1 + R_2}$.",
        "Worked check: $12\\ \\text{V}$ across $4\\ \\Omega$ and $2\\ \\Omega$ gives $I = 2\\ \\text{A}$, drops of $8\\ \\text{V}$ and $4\\ \\text{V}$, and $8 + 4 = 12$ confirms KVL.",
      ],
    },
  ],
};

const TERMS = [
  { term: "Ohm's law", definition: "For an ohmic component, the voltage across it is proportional to the current through it: $V = IR$." },
  { term: "Ohmic component", definition: "A component with constant resistance, so its $I$–$V$ graph is a straight line through the origin." },
  { term: "Resistance", definition: "How strongly a component opposes current, measured in ohms ($\\Omega$): $R = \\frac{V}{I}$." },
  { term: "Power", definition: "The rate a component converts electrical energy, in watts: $P = VI = I^2 R = \\frac{V^2}{R}$." },
  { term: "Node", definition: "A point in a circuit where two or more components connect." },
  { term: "Kirchhoff's current law (KCL)", definition: "Current entering a node equals current leaving it, $\\sum I = 0$. It follows from conservation of charge." },
  { term: "Kirchhoff's voltage law (KVL)", definition: "Voltages around any closed loop sum to zero, $\\sum V = 0$. It follows from conservation of energy." },
  { term: "Voltage divider", definition: "Two resistors in series across a source, giving $V_{out} = V_s \\frac{R_2}{R_1 + R_2}$." },
];

const QUIZ = [
  {
    question: "A $12\\ \\text{V}$ supply is connected across a $4\\ \\Omega$ resistor. What current flows?",
    options: ["$0.33\\ \\text{A}$", "$3\\ \\text{A}$", "$16\\ \\text{A}$", "$48\\ \\text{A}$"],
    answer: 1,
    explanation: "From Ohm's law, $I = \\frac{V}{R} = \\frac{12}{4} = 3\\ \\text{A}$.",
  },
  {
    question: "Three currents enter a node: $2\\ \\text{A}$, $3\\ \\text{A}$ and $1\\ \\text{A}$. One wire leaves. What current does it carry?",
    options: ["$1\\ \\text{A}$", "$4\\ \\text{A}$", "$5\\ \\text{A}$", "$6\\ \\text{A}$"],
    answer: 3,
    explanation: "By KCL, current in equals current out, so the wire carries $2 + 3 + 1 = 6\\ \\text{A}$.",
  },
  {
    question: "What is the total resistance of $6\\ \\Omega$ and $3\\ \\Omega$ in parallel?",
    options: ["$2\\ \\Omega$", "$4.5\\ \\Omega$", "$9\\ \\Omega$", "$18\\ \\Omega$"],
    answer: 0,
    explanation: "$R_T = \\frac{6 \\times 3}{6 + 3} = \\frac{18}{9} = 2\\ \\Omega$, smaller than both resistors, as a parallel total should be.",
  },
  {
    question: "Kirchhoff's voltage law is a consequence of which principle?",
    options: ["Conservation of charge", "Conservation of energy", "Conservation of momentum", "Ohm's law"],
    answer: 1,
    explanation: "A charge that goes around a closed loop ends where it started, so the energy it gains from sources equals the energy it loses in loads. KCL is the one that comes from conservation of charge.",
  },
  {
    question: "A $2\\ \\text{A}$ current flows through a $5\\ \\Omega$ resistor. How much power does it dissipate?",
    options: ["$10\\ \\text{W}$", "$2.5\\ \\text{W}$", "$20\\ \\text{W}$", "$50\\ \\text{W}$"],
    answer: 2,
    explanation: "$P = I^2 R = 2^2 \\times 5 = 20\\ \\text{W}$. Using $P = VI$ with $V = IR = 10\\ \\text{V}$ gives the same answer.",
  },
  {
    question: "A $9\\ \\text{V}$ source feeds $R_1 = 2\\ \\text{k}\\Omega$ and $R_2 = 1\\ \\text{k}\\Omega$ in series. What is the voltage across $R_2$?",
    options: ["$3\\ \\text{V}$", "$4.5\\ \\text{V}$", "$6\\ \\text{V}$", "$9\\ \\text{V}$"],
    answer: 0,
    explanation: "$V_{out} = V_s \\frac{R_2}{R_1 + R_2} = 9 \\times \\frac{1}{3} = 3\\ \\text{V}$.",
  },
];

const CARDS = [
  { front: "State Ohm's law.", back: "$V = IR$: the voltage across an ohmic component is proportional to the current through it." },
  { front: "Three formulas for the power in a resistor", back: "$P = VI$, $P = I^2 R$ and $P = \\frac{V^2}{R}$" },
  { front: "Total resistance of resistors in series", back: "$R_T = R_1 + R_2 + \\dots$, with the same current through each one." },
  { front: "Total resistance of two resistors in parallel", back: "$R_T = \\frac{R_1 R_2}{R_1 + R_2}$, always smaller than the smaller resistor." },
  { front: "What does Kirchhoff's current law say, and why is it true?", back: "Current in equals current out at any node, $\\sum I = 0$, because charge is conserved." },
  { front: "What does Kirchhoff's voltage law say, and why is it true?", back: "Voltages around any closed loop sum to zero, $\\sum V = 0$, because energy is conserved." },
  { front: "Voltage divider output", back: "$V_{out} = V_s \\frac{R_2}{R_1 + R_2}$, where $R_2$ is the resistor you measure across." },
  { front: "Why doesn't a filament lamp obey Ohm's law?", back: "It heats up as current rises, so its resistance changes and the $I$–$V$ graph curves." },
];

/** A fresh copy of the example set, with a little review history so the schedule has something to show. */
export function makeExample(day = today()) {
  const history = [
    { reps: 3, ease: 2.6, interval: 9, due: day + 6, lapses: 0, last: day - 3 },
    { reps: 2, ease: 2.5, interval: 3, due: day + 1, lapses: 0, last: day - 2 },
    { reps: 1, ease: 2.5, interval: 1, due: day, lapses: 0, last: day - 1 },
  ];
  return {
    id: EXAMPLE_ID,
    isExample: true,
    title: "Ohm's law and Kirchhoff's laws",
    createdAt: new Date((day - 3) * 86400000 + 9 * 3600000).toISOString(),
    source: { kind: "paste", name: "", pages: 0 },
    notes: EXAMPLE_NOTES,
    summary: JSON.parse(JSON.stringify(SUMMARY)),
    terms: TERMS.map((t) => ({ ...t })),
    quiz: QUIZ.map((q) => ({ ...q, options: [...q.options] })),
    cards: CARDS.map((c, i) => ({
      id: "ex" + i,
      ...c,
      srs: history[i] ? { ...history[i] } : { reps: 0, ease: 2.5, interval: 0, due: day, lapses: 0, last: null },
    })),
    quizBest: null,
    quizAttempts: 0,
  };
}
