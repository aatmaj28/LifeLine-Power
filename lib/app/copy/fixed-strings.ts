// Fixed, human-authored per-language strings for the resident experience.
//
// These are safety-critical. They are the two `Fixed_Safety_Lines` and the
// `Based_On_Input_Label` from the design, and they are NEVER sent to an AI
// translation service. The translation provider chain deliberately excludes
// these keys; `resolveCopy` overlays these fixed per-language strings last so
// they always win over any AI or template copy.
//
// Translation notes (per the plain-language steering: short, calm, actionable):
//   * "911" is kept verbatim in every language — it is the US emergency number.
//   * The safety lines and the "based on what you entered" label are faithful,
//     calm translations, not literal word-for-word renderings.

import type { SupportedLanguage } from "../plan-storage";

/**
 * The fixed per-language resident strings that must never be AI-translated.
 *
 * @property safetyLine1 "If your device stops and you are in danger, call 911."
 * @property safetyLine2 "Talk to your doctor or equipment supplier about your backup plan."
 * @property basedOnInputLabel "based on what you entered"
 */
export interface FixedStrings {
  safetyLine1: string;
  safetyLine2: string;
  basedOnInputLabel: string;
}

/**
 * Human-authored fixed strings for each {@link SupportedLanguage}. These are the
 * single source of truth for the two safety lines and the based-on-input label;
 * they are copied into resolved copy verbatim and never translated by AI.
 */
export const FIXED_STRINGS: Record<SupportedLanguage, FixedStrings> = {
  en: {
    safetyLine1: "If your device stops and you are in danger, call 911.",
    safetyLine2:
      "Talk to your doctor or equipment supplier about your backup plan.",
    basedOnInputLabel: "based on what you entered",
  },
  es: {
    safetyLine1:
      "Si su equipo se detiene y usted está en peligro, llame al 911.",
    safetyLine2:
      "Hable con su médico o su proveedor de equipos sobre su plan de respaldo.",
    basedOnInputLabel: "según lo que usted ingresó",
  },
  pt: {
    safetyLine1:
      "Se o seu aparelho parar e você estiver em perigo, ligue para o 911.",
    safetyLine2:
      "Fale com o seu médico ou fornecedor do equipamento sobre o seu plano de reserva.",
    basedOnInputLabel: "com base no que você informou",
  },
  ht: {
    safetyLine1:
      "Si aparèy ou a sispann epi ou an danje, rele 911.",
    safetyLine2:
      "Pale ak doktè ou oswa founisè aparèy ou a sou plan sekou ou.",
    basedOnInputLabel: "dapre sa ou te antre",
  },
  "zh-Hans": {
    safetyLine1: "如果您的设备停止工作并且您有危险，请拨打 911。",
    safetyLine2: "请与您的医生或设备供应商谈谈您的备用方案。",
    basedOnInputLabel: "根据您输入的信息",
  },
  vi: {
    safetyLine1:
      "Nếu thiết bị của bạn ngừng hoạt động và bạn gặp nguy hiểm, hãy gọi 911.",
    safetyLine2:
      "Hãy trao đổi với bác sĩ hoặc nhà cung cấp thiết bị của bạn về kế hoạch dự phòng.",
    basedOnInputLabel: "dựa trên thông tin bạn đã nhập",
  },
};

/**
 * Return the fixed per-language strings for a language. Always returns a defined
 * {@link FixedStrings}; every {@link SupportedLanguage} has an entry, and the
 * English entry is the implicit fallback for any unexpected value.
 */
export function getFixedStrings(language: SupportedLanguage): FixedStrings {
  return FIXED_STRINGS[language] ?? FIXED_STRINGS.en;
}
