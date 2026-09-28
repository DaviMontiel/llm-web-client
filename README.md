# LLM Workspace

Cliente web para trabajar con distintos LLMs, pensado para programadores: chats con streaming, ramas de conversación, proyectos con carpeta de trabajo, control explícito del contexto, adjuntos (subida, arrastrar y soltar, pegar imágenes) y aplicación de cambios a archivos **solo con confirmación**.

Es un proyecto **Angular autocontenido**: sin backend, sin servidor propio, sin Electron/Tauri ni software auxiliar. Una vez compilado es una aplicación web estática que habla directamente con las APIs de los proveedores desde el navegador.

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Instalación](#2-instalación)
3. [Desarrollo](#3-desarrollo)
4. [Build y despliegue](#4-build-y-despliegue)
5. [Configuración de modelos](#5-configuración-de-modelos)
6. [API keys](#6-api-keys)
7. [Limitaciones del navegador](#7-limitaciones-del-navegador)
8. [File System Access API](#8-file-system-access-api)
9. [IndexedDB y persistencia](#9-indexeddb-y-persistencia)
10. [Arquitectura](#10-arquitectura)
11. [Cómo añadir un proveedor LLM](#11-cómo-añadir-un-proveedor-llm)
12. [Cómo añadir un tema](#12-cómo-añadir-un-tema)
13. [Cómo añadir un modelo](#13-cómo-añadir-un-modelo)
14. [Limitaciones de CORS](#14-limitaciones-de-cors)
15. [Seguridad](#15-seguridad)
16. [Atajos de teclado](#16-atajos-de-teclado)
17. [Tests y calidad](#17-tests-y-calidad)

---

## 1. Requisitos

| Herramienta | Versión |
| --- | --- |
| Node.js | `^22.22.3`, `^24.15.0` o `>=26` (lo exige Angular 22) |
| npm | 10 o superior |
| Navegador | Chrome/Edge 120+ recomendado (File System Access API). Firefox y Safari funcionan con los fallbacks descritos abajo. |

No se necesita nada más: ni base de datos, ni servidor, ni proxies.

## 2. Instalación

```bash
npm install
```

## 3. Desarrollo

```bash
npm start          # ng serve → http://localhost:4200
npm test           # tests unitarios (Vitest + jsdom), una pasada
npm run test:watch # tests en modo watch
npm run lint       # ESLint (TypeScript + plantillas + accesibilidad)
npm run format     # Prettier
```

Al abrir la app por primera vez aparece una bienvenida: puedes **configurar un modelo** o **explorar la interfaz** sin configurar nada. Si quieres ver el renderizado de Markdown/código sin API key, en *Configuración → Datos* hay un botón **“Cargar ejemplo”** que inserta una conversación estática claramente marcada como demo (no simula ningún modelo).

## 4. Build y despliegue

```bash
npm run build
```

El resultado queda en `dist/llm-web-client/browser/` y es **100 % estático**. Puedes servirlo con cualquier servidor de archivos (Nginx, Apache, GitHub Pages, Netlify, S3…).

- Es una SPA con rutas (`/chat/:id`, `/projects`, `/settings/...`): configura el servidor para devolver `index.html` en rutas desconocidas (*fallback* de SPA).
- En producción se registra un **service worker** (`@angular/service-worker`) que cachea la aplicación: tras la primera visita la interfaz, el historial, la configuración y los proyectos registrados funcionan **offline**. Las llamadas a los LLM obviamente requieren conexión.
- Si despliegas en un subdirectorio, compila con `ng build --base-href /ruta/`.

## 5. Configuración de modelos

*Configuración → Modelos*:

1. Despliega un proveedor (Anthropic, OpenAI o Google), pega tu API key y déjalo activado.
2. Pulsa **“Probar conexión”** (lista los modelos de tu cuenta) y **“Sincronizar modelos”** para guardar la lista real que devuelve la API.
3. Elige un **modelo predeterminado**. Cada chat puede cambiar de modelo en cualquier momento desde la cabecera o desde el composer.

Proveedores incluidos y API usada:

| Proveedor | Adapter | Endpoint |
| --- | --- | --- |
| Anthropic | `AnthropicAdapter` | `POST /v1/messages` (SSE), `GET /v1/models` |
| OpenAI | `OpenAIAdapter` | `POST /v1/responses` (SSE, `store: false`), `GET /v1/models` |
| Google | `GoogleAdapter` | `models/{id}:streamGenerateContent?alt=sse`, `GET /models` |
| Compatible OpenAI | `OpenAICompatibleAdapter` | `POST {baseUrl}/chat/completions` (SSE), `GET {baseUrl}/models` |

Con **“Añadir proveedor compatible”** puedes registrar cualquier API compatible con Chat Completions (plantillas para Ollama, LM Studio y OpenRouter, o personalizada).

El catálogo inicial contiene modelos tomados de la documentación oficial de cada proveedor (septiembre de 2026). Los modelos cambian con frecuencia: **sincroniza** para obtener la lista real. Las ventanas de contexto solo se muestran cuando el proveedor las publica (la API de Anthropic y la de Gemini las devuelven en el listado de modelos).

Para cada modelo puedes marcar si admite **imágenes (visión)** y **streaming**. Si adjuntas imágenes a un modelo sin visión, el composer lo avisa y solo se envían sus nombres.

## 6. API keys

- Se configuran en *Configuración → Modelos* y **nunca se incluyen en el código**.
- Por defecto se guardan en IndexedDB de este navegador. Marcando **“Recordar solo durante esta sesión”** se guardan en `sessionStorage` y desaparecen al cerrar la pestaña.
- **Nunca se exportan** (“Exportar datos” las omite) y se eliminan con “Eliminar datos locales”.

> **Advertencia:** las API keys almacenadas en una aplicación web pueden ser accesibles al cliente. No utilices esta aplicación en un entorno donde necesites proteger una clave frente al usuario.

Usa claves con límites de gasto y permisos mínimos. Cualquier script que se ejecute en el mismo origen (por ejemplo, una extensión del navegador con permisos amplios) podría leerlas.

## 7. Limitaciones del navegador

Una aplicación web **no** puede leer rutas arbitrarias del disco (`/home/usuario/proyecto`) ni ejecutar comandos. Esta app no lo intenta ni lo simula:

- Solo accede a las carpetas/archivos que **tú seleccionas** con los selectores nativos del navegador.
- El navegador **no expone rutas absolutas**: la app muestra el nombre de la carpeta raíz (`flutter-app`) y rutas relativas dentro de ella (`src/app/app.ts`).
- Los permisos sobre carpetas pueden caducar: al volver a abrir la app puede que tengas que pulsar **“Conceder acceso”** (el navegador exige un gesto del usuario).
- Todas las APIs opcionales se detectan en tiempo de ejecución; si faltan, la app degrada sin romperse. *Configuración → Archivos* muestra qué soporta tu navegador.

| Capacidad | API | Fallback |
| --- | --- | --- |
| Carpeta de proyecto persistente | File System Access API (`showDirectoryPicker`) | Instantánea con `<input webkitdirectory>` |
| Pegar imágenes | Evento `paste` (`DataTransfer`) + Async Clipboard API (`ClipboardItem`) | Subir archivo |
| Arrastrar archivos y carpetas | Drag & Drop + `webkitGetAsEntry` | Solo archivos |
| Persistencia | IndexedDB | Memoria (con aviso visible) |
| Streaming | `fetch` + `ReadableStream` | Respuesta completa al terminar |

## 8. File System Access API

En navegadores Chromium, **Proyectos → Seleccionar directorio** abre el selector nativo de carpetas. La app guarda el `FileSystemDirectoryHandle` en IndexedDB para reutilizarlo en sesiones posteriores y gestiona:

- **Permisos**: se consulta `queryPermission` al arrancar; si el estado es `prompt`, se muestra “Conceder acceso” (`requestPermission` dentro del clic).
- **Pérdida de permisos o carpeta eliminada/movida**: estado “No disponible” con opción de volver a seleccionarla.
- **Archivos que desaparecen o fallan al leerse**: errores claros sin romper el estado del chat.
- **Escritura**: solo desde el diálogo **“Aplicar a archivo”** de un bloque de código, que muestra el diff contra el archivo actual y pide permiso `readwrite` al confirmar. **Nunca se modifica nada automáticamente.**

**Fallback** (Firefox/Safari): “Seleccionar directorio” sube la carpeta con `<input webkitdirectory>` y crea una **instantánea** en IndexedDB (archivos de texto hasta 1 MB, 50 MB en total, respetando los patrones ignorados). La UI indica que es una instantánea sin acceso persistente y permite actualizarla. En este modo no se pueden escribir archivos.

### Contexto del proyecto

Nada se envía automáticamente. En el panel **Contexto** del chat (icono de capas) ves y controlas exactamente qué se enviará:

- Instrucciones del proyecto (activables).
- Archivos del proyecto añadidos desde el explorador (pestaña **Archivos**, filtro, añadir carpetas completas con límite).
- Adjuntos pendientes del composer.
- Tamaño total frente al límite configurable y, si el proveedor lo informa, **tokens de entrada reales** de la última respuesta frente a la ventana de contexto del modelo (no se estiman tokens en el cliente).

Se ignoran por defecto `node_modules`, `.git`, `dist`, `build`, `target`, `.angular`, lockfiles, binarios… Los patrones (sintaxis tipo `.gitignore`) se configuran globalmente en *Configuración → Archivos* y por proyecto.

## 9. IndexedDB y persistencia

Base de datos `llm-workspace` con los stores:

| Store | Contenido |
| --- | --- |
| `chats` | Metadatos de chats (título, modelo, proyecto, rama activa, selección de contexto) |
| `messages` | Mensajes (índice `chatId`), incluidos adjuntos |
| `projects` | Proyectos |
| `handles` | `FileSystemDirectoryHandle` por proyecto |
| `snapshotFiles` | Instantáneas de carpetas (índice `projectId`) |
| `kv` | Configuración y proveedores |

- `StorageService` abstrae IndexedDB tras la interfaz `StorageBackend`; si IndexedDB no está disponible usa `MemoryBackend` y muestra un aviso.
- **Chats temporales**: nunca se escriben en IndexedDB; viven en memoria y en `sessionStorage` (sobreviven a una recarga, desaparecen al cerrar la pestaña).
- **Autosave**: los mensajes se guardan al crearse y, durante el streaming, con *throttle* (cada 1,5 s). Si se cierra el navegador en mitad de una generación, al volver el mensaje aparece como **interrumpido** con su contenido parcial.
- El tema se cachea en `localStorage` para aplicarlo antes del primer render (sin parpadeo).
- *Configuración → Datos*: uso de almacenamiento, solicitud de almacenamiento persistente (`navigator.storage.persist`), exportar/importar JSON y borrado total.

**Importación**: se valida el JSON (formato, tipos, mensajes huérfanos, entradas inválidas) y se muestra un resumen. Si hay elementos existentes eliges: omitirlos, importarlos como copia o reemplazarlos. Nunca se sobrescribe en silencio.

## 10. Arquitectura

```text
src/app/
  core/                      Lógica sin UI (servicios singleton + signals)
    models/                  Chat, Message, Attachment, Project, LLMProvider, LLMModel, Settings…
    storage/                 StorageBackend, IdbBackend, MemoryBackend, StorageService
    llm/                     LLMAdapter, SSE, errores HTTP, catálogo, ProviderConfigService, LlmService
      adapters/              Anthropic, OpenAI (Responses), Google (Gemini), OpenAI-compatible
    chat/                    ChatStore (árbol de mensajes, streaming, abort), RequestBuilder, búsqueda
    filesystem/              Adjuntos, portapapeles, drag & drop, File System Access, detección de binarios
    projects/                ProjectService (handles, permisos, instantáneas, lectura/escritura)
    settings/  theme/  i18n/ Configuración, temas (CSS variables), traducciones es/en
    data/                    Exportar/importar, datos de demostración
    ui/                      Toasts, diálogos, menús, layout, puente con el composer
    utils/                   glob, diff, árbol de conversación, títulos, formato…
  layout/                    Shell, sidebar, overlay de drop, diálogos globales
  features/
    chat/                    Página de chat, cabecera, lista de mensajes, mensaje, composer, selector de modelo, panel de contexto
    history/                 Búsqueda global, acciones de chat
    projects/                Lista, detalle, explorador, vista previa, aplicar cambios (diff)
    settings/                General, Modelos, Temas, Chat, Archivos, Datos
  shared/                    Icono, modal, menú, toasts, switch, estados vacíos, Markdown, bloques de código, pipes
```

Decisiones clave:

- **Standalone components + Signals**, `OnPush` en todos los componentes y detección de cambios *zoneless*. Sin NgRx: los stores son servicios con signals.
- **Capa LLM desacoplada**: los componentes nunca llaman a `fetch`. `ChatStore` pide a `LlmService` un `Observable<ChatStreamEvent>` (`token` / `usage` / `complete`); cancelar la suscripción aborta la petición con `AbortController`.
- **Árbol de mensajes**: cada mensaje tiene `parentId`; el chat guarda la hoja activa. Editar o regenerar crea **ramas** (selector `‹ 1/2 ›`) en lugar de borrar historial. “Continuar desde aquí” fija la hoja en un mensaje anterior.
- **Streaming eficiente**: los tokens se acumulan y se vuelcan al signal una vez por frame (`requestAnimationFrame`); solo cambia la referencia del mensaje en curso, así que el resto de la lista no se re-renderiza. El Markdown de mensajes completos se cachea (LRU).
- **Listas largas**: historial con *virtual scroll* (CDK) y conversaciones renderizadas por ventanas de 60 mensajes con `content-visibility: auto`.
- **Scroll inteligente**: autoscroll solo si estás al final; si has subido aparece “↓ Nuevos mensajes”.
- **Doble envío**: el composer y el store bloquean envíos concurrentes; “Reintentar” reutiliza el mismo mensaje fallido.

## 11. Cómo añadir un proveedor LLM

1. Crea `src/app/core/llm/adapters/mi-proveedor.adapter.ts` implementando `LLMAdapter`:

   ```ts
   export class MiProveedorAdapter implements LLMAdapter {
     readonly kind = 'mi-proveedor' as const;
     send(request: ChatRequest, connection: ConnectionInfo): Observable<ChatStreamEvent> {
       return abortableObservable(async (signal, emit) => {
         const res = await providerFetch(joinUrl(connection.baseUrl, '/chat'), { method: 'POST', body: '…', signal });
         for await (const ev of readSseEvents(res)) emit({ type: 'token', text: /* … */ '' });
         emit({ type: 'complete' });
       });
     }
     async listModels(connection: ConnectionInfo): Promise<LLMModel[]> { /* … */ return []; }
   }
   ```

   `providerFetch` mapea los códigos HTTP a `AppError` (`auth`, `rate_limit`, `network`…), `readSseEvents` parsea SSE y `normalizeConversation` garantiza alternancia de roles.
2. Añade el tipo a `ProviderKind` en `core/models/llm.model.ts`.
3. Regístralo en el constructor de `LlmService` (`this.registerAdapter(new MiProveedorAdapter())`).
4. Añade su definición a `BUILTIN_PROVIDERS` en `core/llm/provider-catalog.ts` (URL base, si requiere API key, nota de CORS).

Si la API es compatible con OpenAI Chat Completions no hace falta código: usa “Añadir proveedor compatible”.

## 12. Cómo añadir un tema

1. En `src/styles/themes.css`, copia un bloque existente y cambia el selector: `[data-theme='mi-tema'] { … }` (todas las variables: `--background`, `--foreground`, `--surface`, `--surface-hover`, `--border`, `--muted`, `--accent`, `--accent-foreground`, `--code-bg`, colores de sintaxis `--syn-*`, diff…).
2. Regístralo en `src/app/core/theme/themes.ts` con su esquema (`light`/`dark`) y colores de vista previa.
3. Añade `theme.mi-tema.name` y `theme.mi-tema.desc` en `core/i18n/es.ts` y `en.ts`.

## 13. Cómo añadir un modelo

- **Desde la UI**: *Configuración → Modelos → proveedor → “Añadir modelo”* (ID exacto, nombre, ventana de contexto opcional, visión). O “Sincronizar modelos” para traer la lista de la API.
- **En el catálogo**: añade una entrada en `models` del proveedor en `provider-catalog.ts` usando el helper `model(providerId, id, nombre, { contextWindow, maxOutputTokens, vision })`. Usa solo IDs documentados por el proveedor.

## 14. Limitaciones de CORS

La app llama a las APIs **directamente desde el navegador**, así que el proveedor debe permitir CORS:

| Proveedor | Estado |
| --- | --- |
| Anthropic | Permitido enviando `anthropic-dangerous-direct-browser-access: true` (la app lo hace). |
| OpenAI | La API admite peticiones de navegador. Si tu organización restringe orígenes, fallarán. |
| Google Gemini | Admite peticiones de navegador con `x-goog-api-key`. |
| Ollama | Debes permitir el origen de la app: `OLLAMA_ORIGINS=http://localhost:4200 ollama serve` (o el dominio donde la despliegues). |
| LM Studio / otros | Activa CORS en el servidor local o en el proveedor. |

Si un proveedor no permite llamadas desde el navegador, el navegador bloquea la petición y la app muestra *“No se pudo conectar con el modelo… (CORS)”*. Esta app **no** incluye ni requiere un proxy o backend para sortearlo, por diseño.

## 15. Seguridad

- **Markdown endurecido**: el HTML crudo que devuelve un modelo se muestra como texto (nunca se interpreta), los enlaces solo admiten `http(s)`/`mailto`/anclas y se abren con `rel="noopener noreferrer nofollow"`, las imágenes remotas no se cargan (evita *tracking*). El resultado pasa además por el sanitizador de Angular. No se usa `innerHTML` con contenido sin sanear.
- **No se ejecuta código** recibido del LLM. Los bloques de código solo se copian, descargan o aplican a un archivo tras ver el diff y confirmar.
- **Archivos**: detección de binarios por extensión y contenido (nunca se tratan como texto), límites configurables de tamaño/número/contexto, nombres saneados para descargas, rutas relativas validadas (sin `..` ni rutas absolutas) al escribir.
- **Importación**: validación estricta del JSON antes de insertar nada.
- **API keys**: ver [§6](#6-api-keys). No se envían a ningún sitio salvo a la URL base del proveedor configurado.

## 16. Atajos de teclado

| Atajo | Acción |
| --- | --- |
| `Ctrl/Cmd + K` | Búsqueda global (chats, mensajes, proyectos) |
| `Ctrl/Cmd + Shift + O` | Nuevo chat |
| `Ctrl/Cmd + B` | Mostrar/ocultar la barra lateral |
| `Ctrl/Cmd + /` | Mostrar atajos |
| `Enter` / `Shift + Enter` | Enviar / nueva línea (configurable a `Ctrl/Cmd + Enter`) |
| `↑` (composer vacío) | Editar el último mensaje |
| `Esc` | Cerrar modal, menú, panel o drawer; detener generación desde el composer |

Menús contextuales con clic derecho sobre chats (renombrar, duplicar, exportar, eliminar…) y archivos del explorador (abrir, adjuntar, añadir al contexto, copiar ruta).

## 17. Tests y calidad

- TypeScript `strict`, `strictTemplates`, sin `any`.
- ESLint con `angular-eslint` (incluidas reglas de accesibilidad de plantillas) y Prettier.
- Tests (Vitest + jsdom, `fake-indexeddb`) para: almacenamiento (IndexedDB y memoria), `ChatStore` (crear/eliminar/duplicar, temporales, streaming, stop, retry, ramas, recuperación tras cierre, contexto de proyecto), adapters LLM (cuerpos de petición, SSE, errores, abort, listados), parser SSE, portapapeles, adjuntos, drag & drop de carpetas, proyectos (instantáneas, lectura, límites), configuración y proveedores, exportación/importación, Markdown/XSS, utilidades y componentes (composer, mensaje, app).

```bash
npm test
npm run lint
```
