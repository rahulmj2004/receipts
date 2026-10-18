import type { Atom, RequirementChain, Revision } from "../types";

/**
 * Links atoms that talk about the same thing into requirement chains.
 *
 *  supersedes          explicit correction ("actually…", "change … to …") or an explicit removal
 *                      of something previously required
 *  cancels             the user dropped an earlier ask ("never mind the email")
 *  refines             same subject, compatible detail added later
 *  potential-conflict  same subject, incompatible values, no correction cue → human review
 */

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  return inter / (sa.size + b.length - inter);
}

function overlap(a: string[], b: string[]): number {
  const sa = new Set(a);
  return b.filter((x) => sa.has(x)).length;
}

export function latestAtom(chain: RequirementChain): Atom {
  return chain.revisions[chain.revisions.length - 1].atom;
}

/** Revisions that still apply: everything after the last supersede, plus that supersede. */
export function applicableRevisions(chain: RequirementChain): Revision[] {
  let from = 0;
  chain.revisions.forEach((r, i) => {
    if (r.relation === "supersedes" || r.relation === "cancels") from = i;
  });
  return chain.revisions.slice(from).filter((r) => r.relation !== "cancels");
}

function related(atom: Atom, chain: RequirementChain): boolean {
  const last = latestAtom(chain);
  if (atom.concept !== chain.concept) return false;
  if (atom.concept === "general") return jaccard(atom.keywords, last.keywords) >= 0.5;
  // Concepts that can legitimately appear several times need some shared subject words.
  if (atom.concept === "persistence" || atom.concept === "error-handling" || atom.concept === "form-fields") {
    const all = chain.revisions.flatMap((r) => r.atom.keywords);
    return overlap(atom.keywords, all) >= 2 || jaccard(atom.keywords, last.keywords) >= 0.34;
  }
  return true;
}

function conflicts(a: Atom, b: Atom): boolean {
  if (a.value && b.value && a.value !== b.value) return true;
  return a.polarity !== b.polarity;
}

const REMOVAL = /^(?:remove|delete|drop|get rid of|ditch|eliminate|strip)\b/i;

export function buildChains(
  atoms: Atom[],
  resolutions: Record<string, "supersede" | "keep"> = {},
): RequirementChain[] {
  const chains: RequirementChain[] = [];

  for (const atom of atoms) {
    const candidates = chains.filter((c) => c.state === "active" && related(atom, c));
    const target = candidates[candidates.length - 1];

    if (!target && atom.cue === "cancel") {
      chains.push({
        id: `req-${atom.id}`,
        concept: atom.concept,
        state: "cancelled",
        revisions: [
          { atom, relation: "cancels", note: `Message ${atom.messageIndex} drops something that couldn't be matched to an earlier request.` },
        ],
      });
      continue;
    }

    if (!target) {
      chains.push({
        id: `req-${atom.id}`,
        concept: atom.concept,
        state: "active",
        revisions: [{ atom, relation: "original", note: `First asked in message ${atom.messageIndex}.` }],
      });
      continue;
    }

    const last = latestAtom(target);
    const n = atom.messageIndex;
    const resolution = resolutions[atom.id];

    if (atom.cue === "cancel" && last.polarity === "require") {
      target.revisions.push({
        atom,
        relation: "cancels",
        note: `Dropped in message ${n}: the earlier ask no longer applies.`,
      });
      target.state = "cancelled";
      continue;
    }

    const explicitRemoval = REMOVAL.test(atom.title) && last.polarity === "require";
    if (atom.cue === "correction" || explicitRemoval || resolution === "supersede") {
      target.revisions.push({
        atom,
        relation: "supersedes",
        note:
          resolution === "supersede"
            ? `You confirmed message ${n} replaces message ${last.messageIndex}.`
            : `Message ${n} explicitly changes message ${last.messageIndex}${atom.cue === "correction" ? " (correction wording)" : " (removal)"}.`,
      });
      delete target.review;
      continue;
    }

    if (conflicts(atom, last)) {
      const chain: RequirementChain = {
        id: `req-${atom.id}`,
        concept: atom.concept,
        state: "active",
        revisions: [{ atom, relation: "original", note: `First asked in message ${n}.` }],
      };
      if (resolution !== "keep") {
        const note = `Message ${n} may conflict with message ${last.messageIndex}, but doesn't say it replaces it.`;
        chain.revisions[0] = { atom, relation: "potential-conflict", note };
        chain.review = { withChainId: target.id, atomId: atom.id, note };
        target.review = { withChainId: chain.id, atomId: atom.id, note };
      }
      chains.push(chain);
      continue;
    }

    target.revisions.push({
      atom,
      relation: "refines",
      note: `Message ${n} adds detail to message ${last.messageIndex}.`,
    });
  }
  return chains;
}
