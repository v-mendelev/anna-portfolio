import { demos, type DemoSlug } from './demos';

export function getDemo(slug: DemoSlug) {
  const demo = demos.find((d) => d.slug === slug);
  if (!demo) throw new Error(`Demo "${slug}" is not registered in src/site/demos.ts`);
  return demo;
}
