// ─── Grupo de columnas ────────────────────────────────────────────────────────
export interface GroupDef {
  key: string;
  label: string;
  bg: string;        // color de fondo del encabezado
  textColor: string; // color del texto del encabezado
  cellBg: string;    // color de fondo de las celdas de datos
}

// ─── Definición de columna ────────────────────────────────────────────────────
export interface ColDef {
  key: string;
  label: string;
  width: number;
  isTA?: boolean;    // usa teclado con "/"
  readOnly?: boolean;
  group: string;     // key del GroupDef al que pertenece
}

// ─── Campos del formulario de creación de paciente ───────────────────────────

/** 'hidden' = no mostrar · 'optional' = mostrar sin * · 'required' = mostrar con * y validar */
export type FieldMode = 'hidden' | 'optional' | 'required';

/**
 * Define qué campos del formulario de creación muestra este hospital.
 * `cama` y `peso` son siempre obligatorios y no se pueden ocultar.
 * Cualquier campo no declarado se trata como 'optional'.
 */
export interface PatientFieldsDef {
  nombre?:   FieldMode;
  edad?:     FieldMode;
  registro?: FieldMode;
  talla?:    FieldMode;
}

// ─── Configuración de hospital ────────────────────────────────────────────────
export interface HospitalConfig {
  id: string;
  name: string;
  abbreviation: string;
  groups: GroupDef[];         // grupos de columnas (orden importa)
  dataCols: ColDef[];         // columnas de la tabla (sin N° y Hora, que son fijas)
  patientFields?: PatientFieldsDef; // formulario de creación de paciente
  isCustom?: boolean;         // true si fue creada por el usuario

  // Fórmulas opcionales — si no se definen se usa la implementación estándar
  calcSC?: (peso: number) => number;
}
