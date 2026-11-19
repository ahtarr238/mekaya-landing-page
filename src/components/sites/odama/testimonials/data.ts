export interface Testimonial {
  quote: string;
  author: string;
  company: string;
  portrait: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      "Excellent product video design partner. Timely delivery. Very generous with revisions and expert level design abilities. Had a white-glove onboarding experience to take our team’s vague problem statement into beautiful product videos and images.",
    author: "Adam Liang",
    company: "Ropes",
    portrait: "/sites/odama/homepage/testimonial/Adam Liang.png",
  },
  {
    quote:
      "Amazing work by Odama, very creative and responsive. Finds a way to translate the client’s high-level ideas into a beautiful design.",
    author: "Byong Su Rhew",
    company: "The Workflow Company",
    portrait: "/sites/odama/homepage/testimonial/Byong Su Rhew.png",
  },
  {
    quote:
      "The Odama team was very professional, fast, and delivered great designs. Communication was seamless, and I'll definitely work with them again on future projects. The whole team was an amazing group of contributors.",
    author: "Suwira Teo",
    company: "Aleph Technologies",
    portrait: "/sites/odama/homepage/testimonial/Suwira Teo.png",
  },
];

export const wordsOf = (quote: string) => quote.match(/\S+\s*/g) ?? [];

/** Show the first `n` words; the caret only shows while the quote is part-way typed. */
export function revealWords(words: HTMLElement[], caret: HTMLElement | null, n: number) {
  words.forEach((w, i) => {
    w.hidden = i >= n;
  });
  if (caret) caret.hidden = n <= 0 || n >= words.length;
}
