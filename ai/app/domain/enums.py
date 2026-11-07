from enum import StrEnum


class AiTask(StrEnum):
    JUDGE = "judge"
    NEWS = "news"
    NPC_NEGOTIATION = "npc_negotiation"
    GM_ECONOMY = "gm_economy"


class Verdict(StrEnum):
    GUILTY = "guilty"
    NOT_GUILTY = "not_guilty"
    SETTLEMENT = "settlement"


class GmAction(StrEnum):
    RAISE_RATE = "raise_rate"
    CUT_RATE = "cut_rate"
    TRIGGER_CRISIS = "trigger_crisis"
    STIMULUS = "stimulus"
    DO_NOTHING = "do_nothing"


class NpcPersonality(StrEnum):
    AGGRESSIVE = "aggressive"
    CAUTIOUS = "cautious"
    GREEDY = "greedy"
    HONEST = "honest"
