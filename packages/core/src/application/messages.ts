/** Shown when a stage is started without `GITHUB_TOKEN`. */
export const TOKEN_MISSING = 'GITHUB_TOKEN fehlt — ohne Token kann die App keine Branches und PRs anlegen (siehe README).'

/** Shown when a stage is started or answered (or a second reset requested) while `resetSystem` runs. */
export const RESET_RUNNING = 'Repo wird gerade zurückgesetzt — bitte kurz warten'

/** Shown when stage 2 starts but `intent.md` is not on the base branch. */
export const INTENT_MISSING = 'Intent fehlt auf showcase — erst Stufe 1 abschließen'

/** Shown when the design agent asks once more after it used up its questions (`QUESTION_LIMIT`). */
export const QUESTION_LIMIT_REACHED = 'Rückfragen-Grenze erreicht — der Agent hat keine Spec geliefert'
