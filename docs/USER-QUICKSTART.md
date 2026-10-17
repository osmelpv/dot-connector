# Crear y revisar un borrador de configuración

Este configurador prepara un documento para revisar. **Personal, Proyecto y Consulta sólo generan borradores**: ninguno conecta una terminal, concede permisos ni activa aislamiento. `EXPORT` devuelve el documento; no aprueba ni aplica su contenido. No introduzcas contraseñas, tokens ni claves.

## Comenzar desde este checkout

Abre una terminal en el checkout que contiene esta guía. La versión del paquete por sí sola no identifica las funciones disponibles: varias ramas todavía declaran 0.1.13. La rama review/integrated-setup-preview reúne wizard, perfiles, ayuda, cleanup de salida, vista humana local y recuperación de lectura. El configurador sigue separado de la activación de la vista: exportar un borrador no inicia ninguna sesión.

```sh
node scripts/configure.mjs --help
node scripts/configure.mjs detect --json
node scripts/configure.mjs wizard
```

Sin argumentos también se obtiene ayuda. En una terminal interactiva la ayuda se muestra como texto legible; con `--json`, o cuando stdout se redirige (como hacen los agentes), devuelve el mismo JSON de siempre. `--human` fuerza el texto. `detect` devuelve JSON; describe capacidades del planificador, no descubre equipos ni comprueba conexiones. `wizard` necesita entrada y stderr conectados a una terminal. Sus preguntas, revisión e instrucciones finales van a stderr; stdout contiene un único objeto JSON. `review --human` es la excepción explícita que devuelve texto en stdout.

El asistente pide una etiqueta de equipo elegida por ti, un nombre de perfil único, modo, plataforma, carpeta e intención de privacidad. Usa etiquetas de 1 a 64 letras ASCII, dígitos, `_` o `-`, por ejemplo `local` y `revision`. No se descubren cuentas ni se escogen carpetas o permisos automáticamente.

Para una carpeta Linux escribe `/projects/example`. Para Windows escribe `C:\Projects\Example`. Son ejemplos: reemplázalos por tu elección. Deben ser rutas absolutas normalizadas, sin segmentos `..` y distintas de otras carpetas del borrador. La carpeta declarada no se inspecciona ni se verifica. La opción `--file`, en cambio, lee el archivo JSON explícitamente indicado y necesita una ruta absoluta del sistema donde se ejecuta Node.

Puedes corregir cada respuesta hasta tres intentos o escribir `:cancel`. Las opciones de privacidad sólo expresan intención futura. Al final revisa el documento y escribe exactamente `EXPORT` si quieres recibirlo; cancelar no devuelve un plan exitoso.

## Guardar sin sobrescribir en Bash / WSL

El siguiente bloque crea `draft.json` en la carpeta actual. `noclobber` impide sobrescribir un archivo existente. Las preguntas permanecen visibles porque sólo se redirige stdout. Si ya existe, elige otro nombre; no retires la protección para continuar.

```sh
(
  set -o noclobber
  node scripts/configure.mjs wizard > draft.json
)
```

Estos bloques usan sintaxis Bash. Si tu shell es fish (o zsh u otra), ejecútalos con Bash sin cambiar de shell por defecto, por ejemplo:

```sh
bash -c 'set -o noclobber; node scripts/configure.mjs wizard > draft.json'
```

En fish, `set -o noclobber` falla con `set: -o: unknown option` y no activa ninguna protección. Si ves ese error, no continúes con la redirección suelta (`node scripts/configure.mjs wizard > draft.json`): fish la ejecutaría como otro comando sin `noclobber` y podría sobrescribir un archivo existente. Usa siempre el envoltorio `bash -c` de arriba, que activa `noclobber` y redirige dentro del mismo proceso Bash.

Comprueba que el comando termina correctamente. Si cancelas o falla, el archivo puede contener un objeto de error, no un plan: consérvalo para diagnosticar o elige un nombre nuevo para repetir. No lo uses como configuración activa. Si lo validas o revisas por error, el configurador responde `CONFIGURATOR_CANCELLED_RESULT` (cancelado) o `CONFIGURATOR_FAILED_RESULT` (otro error) en lugar de un error de esquema.

Revisa el archivo con su ruta absoluta:

```sh
node scripts/configure.mjs validate --file "$PWD/draft.json" --json
node scripts/configure.mjs review --file "$PWD/draft.json" --human
node scripts/configure.mjs profiles list --file "$PWD/draft.json" --json
```

Para duplicar un perfil, carga el borrador y guarda el resultado bajo otro nombre, manteniendo la protección:

```sh
(
  set -o noclobber
  node scripts/configure.mjs wizard --file "$PWD/draft.json" > draft-next.json
)
```

La copia pide un nombre y una carpeta distintos, reinicia capacidades a false y destino a local/local-preview. No modifica el archivo de origen. La validación confirma estructura e integridad del borrador, no aprobación, conexión ni disponibilidad de aislamiento.

Estos bloques de guardado son para Bash/WSL. En PowerShell puedes ejecutar ayuda y el asistente sin redirección; no reutilices los bloques Bash como si fueran sintaxis PowerShell.

## Checkout de prueba e instalación gestionada

Probar este checkout separado no actualiza una instalación gestionada ni demuestra qué versión está instalada. Esta mejora local todavía no es una release publicada. El actualizador admite releases numéricas publicadas o el canal experimental, no una rama ni un SHA. Cambiar el commit conservando la misma versión puede devolver `UPDATE_RELEASE_IDENTITY_CHANGED`: no republiques 0.1.13 para eludirlo.

Un archivo local sólo sirve para un nuevo root de diagnóstico (`diagnostic-only`), no para actualizar un root existente. El cliente MCP predeterminado sólo expone `terminal_status`; no hay un botón de actualización verificado que esta guía pueda recomendar. Las instrucciones de actualización deben proceder de una publicación nueva y verificada. Este flujo termina con un borrador revisable, no con una instalación o conexión lista.


## Revisar la rama integrada sin actualizar la instalación

Usa un directorio nuevo para este checkout; no reemplaces una instalación existente.

```sh
git clone --branch review/integrated-setup-preview --single-branch https://github.com/osmelpv/dot-connector.git dot-connector-preview
cd dot-connector-preview
git rev-parse HEAD
node --version
npm ci --ignore-scripts --no-audit --no-fund
node scripts/configure.mjs --help
node scripts/configure.mjs wizard
```

Compara el SHA con el publicado en el PR de revisión. La validación de este incremento se hizo con Node 22. La política de versiones de Node se revisa por separado en issue #5; este PR no la cambia. `npm ci` instala las dependencias bloqueadas de este checkout sin ejecutar scripts de ciclo de vida (las mismas opciones que CONTRIBUTING.md) y requiere conectividad al registro; no actualiza la instalación gestionada.

Para repetir las pruebas Linux, con Python 3 y tmux ya disponibles, usa el bloque aislado de [COLLABORATOR-TODO.md](COLLABORATOR-TODO.md). Las cifras dependen de la rama; no compares una con la otra:

| Referencia | Rama | Pruebas | QA Chromium |
|---|---|---|---|
| Baseline | `review/ordered-output-collaborator-onboarding` (8e8440f) | 251: 250 aprobadas, 0 fallos, 1 omitida | `browser-observer-qa.mjs`: 7 grupos |
| Revisión integrada | `review/integrated-setup-preview` | 329: 328 aprobadas, 0 fallos, 1 omitida (321/320 en 02a9088, antes de las pruebas de usabilidad del configurador) | `browser-observer-qa.mjs`: 7 grupos y `browser-human-view-qa.mjs`: 11 grupos |

La prueba omitida es la del helper de identidad de Windows. Las dos QA Chromium son distintas: `browser-observer-qa.mjs` no crea ningún runtime: reproduce en memoria fixtures y la traza sintética grabada por el bloque del baseline (`OBSERVER_QA_FRAMES`). `browser-human-view-qa.mjs` sí crea su propio runtime sintético y levanta la vista humana local. Usa una instalación existente de Playwright 1.58.2 y su Chromium, con rutas explícitas; no apuntes a sesiones ni configuraciones privadas:

```sh
PLAYWRIGHT_MODULE=/absolute/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/absolute/playwright-browsers \
OBSERVER_QA_FRAMES="$QA_ROOT/evidence/runtime-trace.json" \
OBSERVER_QA_OUTPUT=/absolute/temporary/observer-qa \
node scripts/browser-observer-qa.mjs

PLAYWRIGHT_MODULE=/absolute/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/absolute/playwright-browsers \
HUMAN_VIEW_QA_OUTPUT=/absolute/temporary/preview-qa \
node scripts/browser-human-view-qa.mjs
```

`$QA_ROOT` es el directorio que crea el bloque de COLLABORATOR-TODO.md. La QA de la vista humana cierra el runtime y los procesos que crea; la del observador sólo cierra su navegador. Sus capturas son evidencia local y no deben agregarse al repositorio. La [vista humana](LOCAL-HUMAN-VIEW.md) es opt-in, sólo observa y usa loopback sin autenticación contra otros procesos locales: no la publiques mediante túnel. La [recuperación](READ-RECOVERY.md) reintenta únicamente lecturas con prefijo retenido completo, nunca entrada. Este checkout no es una nueva versión para el actualizador. Desde el cliente no hay una actualización nueva que aplicar hasta que exista una release publicada y verificada.
