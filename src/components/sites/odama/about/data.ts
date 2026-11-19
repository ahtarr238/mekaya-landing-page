export type CardSet = "clients" | "brands" | "members";

export interface AboutCard {
  name: string;
  src: string;
  hover?: string;
}

const P = "/sites/odama/homepage/about";

const member = (slug: string, name: string): AboutCard => ({
  name,
  src: `${P}/members/${slug}-default.webp`,
  hover: `${P}/members/${slug}-hover.webp`,
});

export const ABOUT_CARDS: Record<CardSet, AboutCard[]> = {
  clients: [
    { name: "Brandboom", src: `${P}/clients/1.webp` },
    { name: "Centuari", src: `${P}/clients/2.webp` },
    { name: "SenaHealth", src: `${P}/clients/3.webp` },
    { name: "Wynveris", src: `${P}/clients/4.webp` },
    { name: "Vornix", src: `${P}/clients/5.webp` },
    { name: "Dot.", src: `${P}/clients/6.webp` },
    { name: "DeepStates", src: `${P}/clients/7.webp` },
    { name: "LuaLegal", src: `${P}/clients/8.webp` },
  ],
  brands: [
    { name: "Elra", src: `${P}/brands/Elra.webp` },
    { name: "Flora Maison", src: `${P}/brands/Flora%20Maison.webp` },
    { name: "Namie", src: `${P}/brands/Namie.webp` },
    { name: "Tagline Studio", src: `${P}/brands/Tagline%20Studio.webp` },
    { name: "Dobu", src: `${P}/brands/Dobu.webp` },
    { name: "DRVN.AI", src: `${P}/brands/DRVN.AI.webp` },
    { name: "Still", src: `${P}/brands/Still.webp` },
    { name: "Altbus", src: `${P}/brands/Altbus.webp` },
  ],
  members: [
    member("rohmad", "Rohmad"),
    member("rendra", "Rendra"),
    member("dicky", "Dicky"),
    member("rafi", "Rafi"),
    member("fandit", "Fandit"),
    member("sheila", "Sheila"),
    member("xenyx", "Xenyx"),
    member("aqila", "Aqila"),
    member("cyntia", "Cyntia"),
    member("yoga", "Yoga"),
    member("lutfi", "Lutfi"),
    member("fachrul", "Fachrul"),
    member("hamnah", "Hamnah"),
    member("fadila", "Fadila"),
    member("ilyas", "Ilyas"),
    member("gilang", "Gilang"),
    member("dimas", "Dimas"),
    member("emir", "Emir"),
    member("faishal", "Faishal"),
    member("latifa", "Latifa"),
    member("purwa", "Purwa"),
  ],
};

export interface Stat {
  value: string;
  label: string;
  set: CardSet;
}

export const STATS: Stat[] = [
  { value: "100+", label: "Clients trusted", set: "clients" },
  { value: "5+", label: "Years of experience", set: "brands" },
  { value: "21", label: "Members working", set: "members" },
];
