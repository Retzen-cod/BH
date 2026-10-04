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
  isTA?: boolean;         // usa teclado con "/"
  readOnly?: boolean;
  isTotal?: boolean;      // columna calculada: suma del grupo en la fila
  group: string;          // key del GroupDef al que pertenece
  alternates?: ColDef[];  // columnas intercambiables vía hold-tap en el encabezado
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

// ─── Balance hídrico ──────────────────────────────────────────────────────────

export interface BalanceDef {
  ingresosGroup?: string; // group key cuyas columnas suman E
  egresosGroup?:  string; // group key cuyas columnas suman a S (S = egresos + PI)
  orinaKey?:      string; // columna usada para DH
}

// ─── Tarjeta de paciente (pantalla 1) ─────────────────────────────────────────

/** Espacio que ocupa la tarjeta del paciente. Lo no declarado se ajusta al contenido. */
export interface CardLayoutDef {
  minHeight?:    number; // alto mínimo de la tarjeta (px) — iguala tarjetas con y sin nombre
  metricsWidth?: number; // ancho reservado a la derecha para BH / DH (px)
  metaLines?:    number; // líneas máximas de la línea de datos (cardPreview); el resto se corta con …
}

// ─── Superficie corporal ──────────────────────────────────────────────────────

/**
 * 'adulto'     → (peso × 4 + 7) / (peso + 90)
 * 'pediatrica' → (peso × 4 + 9) / 100
 */
export type ScFormula = 'adulto' | 'pediatrica';

export interface ScTramo {
  maxPeso?:  number;    // kg, inclusive; sin valor = sin límite superior
  formula:   ScFormula;
  etiqueta?: string;    // se muestra junto al paciente, e.g. "Pediátrico"
}

// ─── Mantenimiento hídrico ────────────────────────────────────────────────────

/**
 * 'hollidaySegar' → mL/día: 100 mL/kg los primeros 10 kg + 50 mL/kg de 10 a 20 kg
 *                   + 20 mL/kg por cada kg sobre 20.
 */
export type MantFormula = 'hollidaySegar';

export interface MantenimientoDef {
  formula: MantFormula;
}

// ─── Configuración de tabla ───────────────────────────────────────────────────
/**
 * Una tabla de balance (p. ej. UCI adultos, pediatría). Es la unidad independiente:
 * columnas, balance, formulario y tarjeta se declaran aquí, y cambiar una tabla
 * nunca afecta a otra — aunque sean del mismo hospital.
 */
export interface TableConfig {
  id: string;                 // único dentro del hospital — no cambiar después de producción
  name: string;               // nombre visible, e.g. "UCI adultos"
  groups: GroupDef[];         // grupos de columnas (orden importa)
  dataCols: ColDef[];         // columnas de la tabla (sin N° y Hora, que son fijas)
  patientFields?: PatientFieldsDef; // formulario de creación de paciente

  /**
   * Campos de Patient que se muestran en la meta-línea de la card en pantalla 1.
   * Claves válidas: 'nombre' | 'edad' | 'peso' | 'sc' | 'registro' | 'talla'
   * Si no se define, se muestra: edad, peso, sc.
   */
  cardPreview?: string[];

  /** Tamaño de la tarjeta en pantalla 1. Serializable (viaja en el .bhd). */
  card?: CardLayoutDef;

  /**
   * Qué entra al balance hídrico de esta tabla. Serializable (viaja en el .bhd).
   * Por defecto: ingresosGroup 'ing', egresosGroup 'egr', orinaKey 'orina'.
   */
  balance?: BalanceDef;

  /**
   * Superficie corporal por tramos de peso. Se usa el primer tramo con peso <= maxPeso;
   * un tramo sin maxPeso cubre el resto. Si se omite: fórmula 'adulto' para todo peso.
   * Serializable (viaja en el .bhd), por eso la fórmula va por nombre y no como función.
   */
  sc?: ScTramo[];

  /**
   * Si se declara y el paciente tiene talla, la SC usa esta fórmula en vez de los tramos
   * por peso. Sin talla se usan los tramos. La etiqueta (e.g. "Pediátrico") sigue
   * saliendo del tramo por peso.
   * 'mosteller' → √(talla cm × peso kg / 3600)
   */
  scConTalla?: 'mosteller';

  /**
   * Si se declara, cada bloque muestra el mantenimiento esperado (M) y E − M,
   * y el encabezado el mantenimiento de 24h. Si se omite, la tabla no cambia.
   */
  mantenimiento?: MantenimientoDef;
}

// ─── Configuración de hospital ────────────────────────────────────────────────
export interface HospitalConfig {
  id: string;
  name: string;
  abbreviation: string;
  tables: TableConfig[];      // al menos una; la primera es la tabla por defecto
  isCustom?: boolean;         // true si fue creada por el usuario
}
