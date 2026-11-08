/** Bầu cử: phiếu quy đổi từ vote + quyên góp (mỗi 1tr ủng hộ = +10 phiếu). */
export interface CandidateScore {
  votes: number;
  donationsMinor: number;
}

export function candidateScore(input: CandidateScore): number {
  return input.votes + Math.floor(input.donationsMinor / 1_000_000) * 10;
}

export interface CandidateResultInput extends CandidateScore {
  id: string;
}

/** Người thắng = điểm cao nhất; hòa thì id nhỏ hơn (deterministic). */
export function electionWinner(candidates: CandidateResultInput[]): string | null {
  let best: CandidateResultInput | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const score = candidateScore(c);
    if (score > bestScore || (score === bestScore && best !== null && c.id < best.id)) {
      best = c;
      bestScore = score;
    }
  }
  return best?.id ?? null;
}
