import { flattenThemeVariables } from './mermaidThemeVariables'
import { THEME_PRESET_DEFS, type ThemePresetDef } from './themePresetDefs'

export interface ThemePreset {
  label: string
  description: string
  themeVariables: Record<string, string>
  configOverrides: ThemePresetDef['configOverrides']
}

function toPreset(def: ThemePresetDef): ThemePreset {
  return {
    label: def.label,
    description: def.description,
    themeVariables: flattenThemeVariables(def.vars) as unknown as Record<string, string>,
    configOverrides: def.configOverrides,
  }
}

export const CUSTOM_THEME_PRESETS: Record<string, ThemePreset> = Object.fromEntries(
  Object.entries(THEME_PRESET_DEFS).map(([key, def]) => [key, toPreset(def)]),
)

export const CUSTOM_THEME_IDS = Object.keys(CUSTOM_THEME_PRESETS) as (keyof typeof CUSTOM_THEME_PRESETS)[]
