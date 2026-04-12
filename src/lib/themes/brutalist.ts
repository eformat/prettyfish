/**
 * Brutalist theme — Neo-brutalism inspired by Gumroad.
 *
 * Design language:
 * - Pure white canvas (#ffffff)
 * - Bold warm yellow accent (#FFE033) — slightly orange-tinted
 * - Near-black text and borders (#0a0a0a) — hard, high-contrast edges
 * - Monospace font throughout (ui-monospace stack)
 * - No rounded corners (square, brutal)
 * - Heavy borders, flat fills, zero gradients
 * - Secondary: orange (#ff6b35) for crit/active/emphasis
 * - Alternating rows: barely-off-white (#f5f5f5)
 */

import type { ThemePresetDef } from '../themePresetDefs'

// Core palette
const YELLOW = '#FFE033'
const BLACK = '#0a0a0a'
const WHITE = '#ffffff'
const ORANGE = '#ff6b35'
const GREY_LIGHT = '#f5f5f5'
const GREY_MID = '#d4d4d4'
const GREY_DARK = '#6b6b6b'
const MONO_FONT =
  "'ui-monospace', 'Cascadia Code', 'Source Code Pro', 'JetBrains Mono', 'Fira Code', monospace"

export const brutalistTheme: ThemePresetDef = {
  label: 'Brutalist',
  description: 'Neo-brutalism: bold yellow accents, near-black borders, monospace typography',
  vars: {
    core: {
      background: WHITE,
      primaryColor: YELLOW,
      primaryTextColor: BLACK,
      primaryBorderColor: BLACK,
      secondaryColor: GREY_LIGHT,
      secondaryTextColor: BLACK,
      secondaryBorderColor: BLACK,
      tertiaryColor: GREY_LIGHT,
      tertiaryTextColor: BLACK,
      tertiaryBorderColor: BLACK,
      lineColor: BLACK,
      titleColor: BLACK,
      fontFamily: MONO_FONT,
    },

    flowchart: {
      mainBkg: YELLOW,
      nodeBorder: BLACK,
      nodeTextColor: BLACK,
      clusterBkg: GREY_LIGHT,
      clusterBorder: BLACK,
      edgeLabelBackground: WHITE,
      defaultLinkColor: BLACK,
    },

    sequence: {
      actorBkg: YELLOW,
      actorBorder: BLACK,
      actorTextColor: BLACK,
      actorLineColor: BLACK,
      signalColor: BLACK,
      signalTextColor: BLACK,
      labelBoxBkgColor: GREY_LIGHT,
      labelBoxBorderColor: BLACK,
      labelTextColor: BLACK,
      loopTextColor: BLACK,
      noteBkgColor: '#fff7cc',
      noteTextColor: BLACK,
      noteBorderColor: BLACK,
      activationBkgColor: GREY_LIGHT,
      activationBorderColor: BLACK,
      sequenceNumberColor: WHITE,
    },

    er: {
      attributeBackgroundColorOdd: WHITE,
      attributeBackgroundColorEven: GREY_LIGHT,
    },

    state: {
      stateLabelColor: BLACK,
      stateBkg: YELLOW,
      compositeBackground: GREY_LIGHT,
      compositeTitleBackground: GREY_MID,
      compositeBorder: BLACK,
      specialStateColor: BLACK,
      errorBkgColor: ORANGE,
      errorTextColor: WHITE,
      transitionLabelColor: BLACK,
      transitionColor: BLACK,
    },

    class: {
      classText: BLACK,
      // fillType0 = default (yellow), 1-7 = variants using greys and orange
      fillType0: YELLOW,
      fillType1: GREY_LIGHT,
      fillType2: '#e8e8e8',
      fillType3: GREY_MID,
      fillType4: ORANGE,
      fillType5: '#ffe8d6',
      fillType6: '#fff3b0',
      fillType7: '#d4d4d4',
    },

    gantt: {
      // Section backgrounds alternate between yellow tints and grey tints
      sectionBkgColor: GREY_LIGHT,
      altSectionBkgColor: WHITE,
      taskBorderColor: BLACK,
      taskBkgColor: YELLOW,
      taskTextColor: BLACK,
      taskTextLightColor: BLACK,
      taskTextDarkColor: BLACK,
      taskTextOutsideColor: BLACK,
      activeTaskBorderColor: BLACK,
      activeTaskBkgColor: ORANGE,
      doneTaskBkgColor: GREY_LIGHT,
      doneTaskBorderColor: GREY_DARK,
      critBkgColor: ORANGE,
      critBorderColor: BLACK,
      todayLineColor: BLACK,
    },

    git: {
      git0: BLACK,
      git1: YELLOW,
      git2: ORANGE,
      git3: GREY_DARK,
      git4: '#222222',
      git5: '#ffb700',
      git6: '#cc4400',
      git7: '#444444',
      commitLabelColor: BLACK,
      commitLabelBackground: GREY_LIGHT,
      // gitBranchLabel = text color on the page background (white canvas)
      gitBranchLabel0: BLACK,
      gitBranchLabel1: BLACK,
      gitBranchLabel2: BLACK,
      gitBranchLabel3: BLACK,
      gitBranchLabel4: BLACK,
      gitBranchLabel5: BLACK,
      gitBranchLabel6: BLACK,
      gitBranchLabel7: BLACK,
    },

    pie: {
      // All slices use black section text — so all fills must be light enough for black text (≥4.5:1 vs #0a0a0a)
      // Pure black and dark greys fail — use light-to-mid fills only
      pie1: YELLOW,        // #FFE033 — 1.12:1 with black? No — need to check
      pie2: GREY_LIGHT,    // #f5f5f5 — very light
      pie3: '#ffe8c8',     // pale orange
      pie4: GREY_MID,      // #d4d4d4
      pie5: '#ffb700',     // amber
      pie6: '#e8e8e8',     // light grey
      pie7: '#ffcba4',     // peach
      pie8: '#c8c8c8',     // mid grey
      pieTitleTextColor: BLACK,
      pieSectionTextColor: BLACK,
      pieStrokeColor: WHITE,
    },

    requirement: {
      requirementBackground: GREY_LIGHT,
      requirementBorderColor: BLACK,
      requirementTextColor: BLACK,
      relationColor: BLACK,
      relationLabelBackground: WHITE,
      relationLabelColor: BLACK,
    },

    quadrant: {
      quadrant1Fill: '#fffbe6',
      quadrant2Fill: WHITE,
      quadrant3Fill: GREY_LIGHT,
      quadrant4Fill: '#fff3b0',
      quadrant1TextFill: BLACK,
      quadrant2TextFill: BLACK,
      quadrant3TextFill: BLACK,
      quadrant4TextFill: BLACK,
      quadrantPointFill: BLACK,
      quadrantPointTextFill: WHITE,
      quadrantXAxisTextFill: BLACK,
      quadrantYAxisTextFill: BLACK,
      quadrantTitleFill: BLACK,
    },

    architecture: {
      archEdgeColor: BLACK,
      archEdgeArrowColor: BLACK,
      archGroupBorderColor: BLACK,
    },

    journey: {
      scaleLabelColor: WHITE,
      // Journey sections: alternate yellow and near-black for brutal contrast
      cScale0: YELLOW,     cScaleLabel0: BLACK,
      cScale1: BLACK,      cScaleLabel1: WHITE,
      cScale2: ORANGE,     cScaleLabel2: WHITE,
      cScale3: GREY_DARK,  cScaleLabel3: WHITE,
      cScale4: '#ffb700',  cScaleLabel4: BLACK,
      cScale5: '#222222',  cScaleLabel5: WHITE,
      cScale6: '#cc4400',  cScaleLabel6: WHITE,
      cScale7: '#555555',  cScaleLabel7: WHITE,
      cScale8: YELLOW,     cScaleLabel8: BLACK,
      cScale9: BLACK,      cScaleLabel9: WHITE,
      cScale10: ORANGE,    cScaleLabel10: WHITE,
      cScale11: GREY_DARK, cScaleLabel11: WHITE,
    },
  },

  configOverrides: {
    look: 'classic',
    fontFamily: MONO_FONT,
    fontSize: 14,
    // Sharp, right-angle edges — brutalist aesthetic
    flowchart: {
      curve: 'linear',
      nodeSpacing: 50,
      rankSpacing: 60,
      padding: 15,
      diagramPadding: 20,
    },
    sequence: {
      actorMargin: 80,
      messageMargin: 40,
      mirrorActors: false,
    },
    gantt: {
      barHeight: 28,
      barGap: 6,
      topPadding: 60,
      axisFormat: '%Y-%m-%d',
    },
  },
}
