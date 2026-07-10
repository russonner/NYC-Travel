# Mapeo Radar → AP360 (importación de órdenes)

Plano maestro para importar una orden completa de Radar Control Total a AP360
(`autoplus-dev`). Cada fila dice: dato de destino en AP360 ← endpoint + campo de
Radar. El importador (Edge `radar-import-orden`) consume el JSON crudo que el
robot arma con estos endpoints y produce el objeto `data` que alimenta
`handleNewOrder` (App.jsx:1500-1594), más los datos que se aplican DESPUÉS de
crear la orden (refacciones, bitácora).

## Endpoints de Radar por orden (confirmados)

Base API: `https://radar-api.azurewebsites.net/api`. Requiere Bearer token
(capturado por el robot al pasar por `/Orders`). `{id}` = orderId INTERNO
(no el número visible; se resuelve con la lista).

| Alias | Endpoint | Para qué |
|---|---|---|
| `lista` | `GET /orders/list?catListKey=Recepcion` | Todas las órdenes activas → resolver número visible → orderId interno |
| `ord` | `GET /orders/{id}` | Vehículo + contactos (cliente) |
| `odb` | `GET /orders/{id}/order-detail-binnacle` | Encabezado: siniestro, póliza, fechas, aseguradora |
| `vd` | `GET /vehicles/orders/{id}/vehicle-detail` | Proceso/subproceso/ubicación actual |
| `valHdr` | `GET /orders/{id}/valuation` | Puntero `{IdValue}` a la valuación |
| `val` | `GET /valuations/{IdValue}` | Cabecera de valuación (días, pérdida total) |
| `sp` | `GET /valuations/{IdValue}/spare-parts` | **Refacciones con costos** |
| `bin` | `GET /binnacle/orders/{id}/logs` | Bitácora completa |
| `pics` | `GET /blobs/{id}/pictures` | **FOTOS**: `[{url, urlThumbnail, processKey, processName}]` |
| `docs` | `GET /documents/record/order/{id}` | **PDFs/documentos**: `[{fileName, fileTypeExtension, urlFile, fileClassificationByWorkshopId}]` |
| `odc` | `GET /documents/odc-documents/{id}` | Órdenes de compra (PDF): `[{folio, provider, total, url}]` |
| `spRec` | `GET /warehouse/orders/{id}/spareparts-received` | Refacciones RECIBIDAS (proveedor+factura+costo) |
| `aseg` | `GET /customers/ASEGURADORA` | Catálogo de aseguradoras (RFC, régimen) |

## Mapeo → objeto `data` de `handleNewOrder`

| Campo AP360 (`data.*`) | Origen Radar | Notas |
|---|---|---|
| `tipoOrigen` | `odb.catOrderType`='SINIESTRO' o `odb.clientType`='Aseguradora' → `'aseguradora'`; si no `'particular'` | Determina `tipo` (SINIESTRO/PARTICULAR) |
| `marca` | `ord.brandDescription` | |
| `modelo` | `ord.modelDescription` | |
| `color` | `ord.color` | |
| `año` | `ord.year` (a string) | ⚠ campo con ñ |
| `vin` | `ord.vin` | |
| `placas` | `ord.plateNumber` | |
| `siniestro` | `odb.sinisterNumber` | **único** en AP360; si choca → GARANTÍA (lo maneja handleNewOrder) |
| `poliza` | `odb.policyNumber` | |
| `ordenante` | `odb.customerPayer \|\| odb.customer` | La aseguradora que paga |
| `cliente` | `ord.contacts[0].ContactName` | El asegurado (dueño del vehículo) |
| `telefono` | `ord.contacts[0].ContactMeanList[?CatTypeMediumContactKey='CEL'].Value` | Primer celular |
| `asesor` | `odb.assesor` (mayúsculas) | |
| `fechaIngreso` | `odb.entryDate` ('dd/mm/yyyy') | Ya en formato es-MX, se conserva |
| `descripcion` | `odb.generalComments \|\| odb.assesorObservation` | Observaciones |
| `expedienteExtras` | (ver documentos) | Fotos/PDF importados |

**No van por `handleNewOrder`** (los aplica un `updateOrder` posterior, porque
handleNewOrder fuerza `refacciones:{recibidas:0,total:0}` y `procesos:[]`):

| Campo AP360 | Origen Radar | Notas |
|---|---|---|
| `refacciones.items[]` | `sp[]` | Ver mapeo de refacciones abajo |
| `fechaPromesa` | `odb.promiseWorkshopDate` | handleNewOrder lo fija en '—'; se setea post-creación |
| `bitacora` (append) | `bin[]` | Se agregan como eventos de bitácora |
| `radarId` | `ord.orderId` | **Clave de idempotencia** (no reimportar) |
| `radarNumber` | `odb.orderNumber` | Número visible en Radar (referencia) |

## Mapeo de refacciones (`sp[]` → `refacciones.items[]`)

Cada elemento de `GET /valuations/{IdValue}/spare-parts`:

| Campo AP360 (item) | Origen Radar | Notas |
|---|---|---|
| `id` | `radar-sp-{sp.Id}` | |
| `nombre` | `sp.SparePartDescription` | |
| `numeroParte` | `sp.PartNumber` | |
| `costo` | `sp.Cost` (Number) | |
| `cantidad` | `sp.Amount` (Number) | |
| `proveedor` | `sp.ProviderName` (≠'Sin Asignar' → '') | |
| `observaciones` | `sp.Observations` | |
| `estado` | map(`sp.StatusKeySparePart`) → `'pendiente_pedido'`\|`'cotizada'`\|`'pedida'`\|`'recibida'` | REGISTRO→pendiente_pedido |
| `origen` | `'radar'` | Marca la procedencia para trazabilidad |
| `fotos` | `[]` | Radar no liga foto a la refacción (por ahora) |

## Documentos y fotos (⏳ estructura pendiente)

Objetivo: bajar **cada foto y cada PDF** de Radar a Storage de AP360 y agregarlas
al `expediente` de la orden. Estructura de una entrada de expediente
(App.jsx:1935-1958, `pushDoc`):

```
{ id, nombre, tipo, etiqueta, mime, url, storagePath, bucket, privado, dataUrl,
  size, fecha, usuario, fuente:'radar' }
```

- Fotos del vehículo → bucket público `orden-fotos` (`url` pública).
- PDFs/documentos oficiales → según sensibilidad (volante/valuación público;
  INE → bucket privado `orden-docs-privados`).
- Las URLs de Radar viven en `radardata.blob.core.windows.net`. El importador
  las descarga y re-sube a Storage de AP360 (no se enlaza directo, para que no
  dependan de Radar).

**Pendiente de descubrir** (iter6 del robot, sobre una orden CON fotos/PDF):
el endpoint/estructura exacta que lista las fotos y los PDFs de una orden.
Se llenará esta sección al obtener el log.

## Flujo de importación (arquitectura)

```
Robot radar-import.mjs (jala 1 orden: ord+odb+vd+val+sp+bin+docs, descarga blobs)
   → POST Edge radar-import-orden { token, radarOrder }
   → Edge mapea a AP360 + sube blobs a Storage + UPSERT en tabla staging
        radar_import_orders (radar_id único, raw_json, mapped_json, status)
   → UI Panel Admin "Importar de Radar": vista previa 1-por-1 →
        "Importar" llama handleNewOrder(mapped.data) + updateOrder(refacciones…)
        marca staging 'importada' y sella radarId en la orden AP360.
```

Idempotencia: `radar_id` único en staging; `radarId` sellado en la orden AP360
evita duplicar (si ya existe una orden con ese `radarId`, se actualiza, no se crea).
