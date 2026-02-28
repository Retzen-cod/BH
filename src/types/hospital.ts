// ─── Definición de columna de tabla ──────────────────────────────────────────
export interface ColDef {
  key: string;
  label: string;
  width: number;
  isTA?: boolean;    // usa teclado con "/"
  readOnly?: boolean;
  group: string;     // 'sv' | 'ing' | 'egr' | (custom)
}

// ─── Configuración de hospital ────────────────────────────────────────────────
export interface HospitalConfig {
  id: string;           // clave única, e.g. "HNSJDDSM"
  name: string;         // nombre completo
  abbreviation: string; // mostrado en UI compacta
  dataCols: ColDef[];   // columnas de la tabla (sin N° y Hora, que son fijas)

  // Fórmulas opcionales — si no se definen se usa la implementación estándar
  calcSC?: (peso: number) => number;
}
