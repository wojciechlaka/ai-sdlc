/** Price and label of a Claude model the app offers. */
export interface ModelInfo {
  /** Display name in the model select and the log. */
  label: string
  /** USD per million input tokens. */
  inputPerMtok: number
  /** USD per million output tokens. */
  outputPerMtok: number
}

// Anthropic provides no pricing API — prices must be updated manually.
// Last verified: 2026-06-26 — https://docs.anthropic.com/en/docs/about-claude/pricing
/** The models offered for a stage run, in select order; prices estimate costs the CLI did not report. */
export const MODELS = {
  'claude-haiku-4-5-20251001': { label: 'Haiku 4.5',  inputPerMtok: 1.00, outputPerMtok:  5.00 },
  'claude-sonnet-4-6':         { label: 'Sonnet 4.6', inputPerMtok: 3.00, outputPerMtok: 15.00 },
  'claude-opus-4-7':           { label: 'Opus 4.7',   inputPerMtok: 5.00, outputPerMtok: 25.00 },
} as const satisfies Record<string, ModelInfo>

/** Model id the app offers. */
export type ModelId = keyof typeof MODELS

/** Ids in select order. */
export const MODEL_IDS = Object.keys(MODELS) as ModelId[]

/** Preselected model of a new stage run. */
export const DEFAULT_MODEL: ModelId = 'claude-sonnet-4-6'

/** Narrows a string (select value, stored run input) to an offered model id. */
export function isModelId(model: string): model is ModelId {
  return Object.hasOwn(MODELS, model)
}

/** Table entry of a model, or undefined for a model the app no longer offers (older log rows). */
export function modelInfo(model: string | undefined): ModelInfo | undefined {
  return model !== undefined && isModelId(model) ? MODELS[model] : undefined
}

/** Display name of a model; the raw id for models not in the table. */
export function modelLabel(model: string): string {
  return modelInfo(model)?.label ?? model
}
