<div align="center">

# ◈ Sistema de Compras HCG

### División de Servicios Administrativos · Hospital Civil de Guadalajara

<br>

![Google Apps Script](https://img.shields.io/badge/Platform-Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google&logoColor=white)
![V8 Runtime](https://img.shields.io/badge/Runtime-V8-FFA500?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-1.0.0-0cce6b?style=for-the-badge)
![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active-e94560?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIvPjwvc3ZnPg==)

<br>

> Plataforma web institucional para la gestión integral de compras,
> requisiciones, expedientes digitales y catálogos del HCG.

<br>

---

</div>

## ◎ Tabla de Contenidos

<table>
<tr>
<td width="50%" valign="top">

### 📋 General

- [▸ Descripción del Proyecto](#-descripción-del-proyecto)
- [▸ Arquitectura del Sistema](#-arquitectura-del-sistema)
- [▸ Diagrama de Flujo de Autenticación](#-diagrama-de-flujo-de-autenticación)
- [▸ Estructura de Archivos](#-estructura-de-archivos)
- [▸ Stack Tecnológico](#-stack-tecnológico)

</td>
<td width="50%" valign="top">

### ⚙️ Desarrollo

- [▸ Configuración del Entorno](#-configuración-del-entorno)
- [▸ Despliegue](#-despliegue)
- [▸ Módulos del Sistema](#-módulos-del-sistema)
- [▸ Sistema de Cache](#-sistema-de-caché)
- [▸ Guía de Estilo del Código](#-guía-de-estilo-del-código)

</td>
</tr>
</table>

---

## ◎ Descripción del Proyecto

**Sistema de Compras HCG** es una aplicación web monolítica construida sobre **Google Apps Script** que opera como una **SPA (Single Page Application)** dentro del ecosistema de Google Workspace. Diseñada para la **División de Servicios Administrativos** del Hospital Civil de Guadalajara, centraliza los flujos de trabajo de adquisiciones institucionales.

<br>

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    🏥  HOSPITAL CIVIL DE GUADALAJARA                            │
│    ═══════════════════════════════════                          │
│                                                                 │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│    │  📝      │  │  🗂️      │  │  📊      │  │  🏠      │      │
│    │ Requisi- │  │ Expedi-  │  │ Catálo-  │  │ Dash-    │      │
│    │ ciones   │  │ entes    │  │ gos      │  │ board    │      │
│    └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│         │             │             │             │             │
│         └─────────────┴──────┬──────┴─────────────┘             │
│                              │                                  │
│                    ┌─────────▼─────────┐                        │
│                    │   SPA Router      │                        │
│                    │   (scripts.html)  │                        │
│                    └─────────┬─────────┘                        │
│                              │                                  │
│                    ┌─────────▼─────────┐                        │
│                    │  Apps Script V8   │                        │
│                    │  Server Runtime   │                        │
│                    └─────────┬─────────┘                        │
│                              │                                  │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│     ┌──────────────┐ ┌─────────────┐ ┌──────────────┐          │
│     │ Google       │ │ Google      │ │ Google       │          │
│     │ Sheets       │ │ Cache       │ │ Identity     │          │
│     │ (Datos)      │ │ Service     │ │ (OAuth)      │          │
│     └──────────────┘ └─────────────┘ └──────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

<br>

### Características Principales

|  #  | Característica                     | Descripción                                                                      |
| :-: | :--------------------------------- | :------------------------------------------------------------------------------- |
|  1  | **🔐 Autenticación institucional** | Validación contra lista blanca en Google Sheets con CacheService                 |
|  2  | **⚡ SPA con carga dinámica**      | Navegación sin recarga mediante renderizado parcial de vistas                    |
|  3  | **🎨 UI moderna y responsive**     | Design tokens, glassmorphism, animaciones escalonadas, tipografía DM Sans/Serif  |
|  4  | **📦 Arquitectura modular**        | Separación clara entre configuración, servicios, lógica de presentación y vistas |
|  5  | **🚀 Optimización de rendimiento** | Cache de sesiones (TTL 30 min), batch reads, passive scroll listeners            |
|  6  | **♿ Accesibilidad**               | Roles ARIA, focus-visible, contraste WCAG, navegación por teclado                |

---

## ◎ Arquitectura del Sistema

<br>

### Capas de la Aplicación

```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   PRESENTATION LAYER                    ┌───────────────────────┐    ║
║   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄                    │                       │    ║
║                                          │    Index.html         │    ║
║   ┌──────────┐  ┌──────────┐            │    ┌─────────────┐    │    ║
║   │ styles   │  │ scripts  │            │    │  styles.html │    │    ║
║   │ .html    │  │ .html    │◄───────────┤    │  scripts.html│    │    ║
║   └──────────┘  └────┬─────┘            │    └──────┬──────┘    │    ║
║                      │                  │           │           │    ║
║                      ▼                  │    ┌──────▼──────┐    │    ║
║   ┌────────────────────────────┐        │    │  Vistas     │    │    ║
║   │      View Modules         │        │    │  Dinámicas  │    │    ║
║   │  ┌─────────┐ ┌─────────┐  │        │    └─────────────┘    │    ║
║   │  │Dashboard│ │Requisic.│  │        │                       │    ║
║   │  └─────────┘ └─────────┘  │        └───────────────────────┘    ║
║   │  ┌─────────┐ ┌─────────┐  │                                    ║
║   │  │Expedien.│ │Catálogos│  │                                    ║
║   │  └─────────┘ └─────────┘  │                                    ║
║   │  ┌─────────┐              │                                    ║
║   │  │Err_Auth │              │                                    ║
║   │  └─────────┘              │                                    ║
║   └────────────────────────────┘                                    ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║   SERVICE LAYER                        ┌───────────────────────┐    ║
║   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄                     │                       │    ║
║                                          │    AuthService.gs     │    ║
║   ┌────────────────────────────┐        │                       │    ║
║   │      AuthService           │◄───────┤  • getActiveUserSession│    ║
║   │  ┌──────────────────────┐  │        │  • CacheService       │    ║
║   │  │ CacheService Layer   │  │        │  • Batch Sheet Read   │    ║
║   │  └──────────────────────┘  │        │                       │    ║
║   │  ┌──────────────────────┐  │        └───────────────────────┘    ║
║   │  │ Spreadsheet Layer    │  │                                    ║
║   │  └──────────────────────┘  │                                    ║
║   └────────────────────────────┘                                    ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║   CONFIGURATION LAYER                  ┌───────────────────────┐    ║
║   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄               │                       │    ║
║                                          │    Config.gs          │    ║
║   ┌────────────────────────────┐        │                       │    ║
║   │   Config.gs                │◄───────┤  • SS_CONFIG_ID       │    ║
║   │   • Spreadsheet ID         │        │  • SHEETS enum        │    ║
║   │   • Sheet names            │        │  • CACHE_CONFIG       │    ║
║   │   • Cache TTL              │        │                       │    ║
║   └────────────────────────────┘        └───────────────────────┘    ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║   INFRASTRUCTURE                       ┌───────────────────────┐    ║
║   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄                     │                       │    ║
║                                          │  Google Workspace     │    ║
║   ┌──────────┐ ┌──────────┐            │  ┌──────────────┐     │    ║
║   │ Google   │ │ Google   │            │  │  Apps Script │     │    ║
║   │ Sheets   │ │ Cache    │            │  │  V8 Runtime  │     │    ║
║   │ (Datos)  │ │ Service  │            │  └──────────────┘     │    ║
║   └──────────┘ └──────────┘            │  ┌──────────────┐     │    ║
║   ┌──────────┐ ┌──────────┐            │  │  HtmlService │     │    ║
║   │ Google   │ │ Session  │            │  └──────────────┘     │    ║
║   │ Drive    │ │ Service  │            │                       │    ║
║   └──────────┘ └──────────┘            └───────────────────────┘    ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

<br>

### Flujo de Datos — Patrón SPA

```
  👤 Usuario                 🖥️ Navegador                  ⚙️ Servidor
  ─────────                 ────────────                  ────────────
      │                          │                            │
      │    1. Accede a URL       │                            │
      │ ───────────────────────► │                            │
      │                          │   2. doGet()               │
      │                          │ ─────────────────────────► │
      │                          │                            │
      │                          │   3. Index.html            │
      │                          │    + styles.html           │
      │                          │    + scripts.html          │
      │                          │ ◄───────────────────────── │
      │                          │                            │
      │                          │   4. getActiveUserSession()│
      │    "Verificando..."      │ ─────────────────────────► │
      │ ◄─────────────────────── │                            │
      │                          │        ┌───────────────┐   │
      │                          │        │ CacheService  │   │
      │                          │        │   HIT? ──► ✅ │   │
      │                          │        │   MISS? ──►   │   │
      │                          │        │  Sheets Read  │   │
      │                          │        │  ──► Cache    │   │
      │                          │        └───────────────┘   │
      │                          │                            │
      │                          │   5. UserDTO | null        │
      │                          │ ◄───────────────────────── │
      │                          │                            │
      │                          │  ┌─ session === null?      │
      │                          │  │   ► View_Error_Auth     │
      │                          │  │                         │
      │                          │  └─ session !== null?      │
      │                          │    ► Mostrar navegación    │
      │                          │    ► Cargar Dashboard      │
      │                          │                            │
      │    6. Interfaz lista     │                            │
      │ ◄─────────────────────── │                            │
      │                          │                            │
      │    7. Clic en menú       │                            │
      │ ───────────────────────► │                            │
      │                          │   8. include(viewPath)     │
      │                          │ ─────────────────────────► │
      │                          │                            │
      │                          │   9. HTML del módulo       │
      │                          │ ◄───────────────────────── │
      │                          │                            │
      │    10. Vista actualizada │                            │
      │ ◄─────────────────────── │                            │
      │                          │                            │
```

---

## ◎ Diagrama de Flujo de Autenticación

```
                          ┌─────────────────┐
                          │   INICIO        │
                          │   window.load   │
                          └────────┬────────┘
                                   │
                                   ▼
                     ┌─────────────────────────┐
                     │  validateAccess()        │
                     │  Llamada al servidor     │
                     └────────────┬────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────┐
                     │  getActiveUserSession()  │
                     └────────────┬────────────┘
                                  │
                                  ▼
                        ┌─────────────────┐
                        │  ¿Email         │
                        │  disponible?    │
                        └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                   NO                        SÍ
                    │                         │
                    ▼                         ▼
           ┌──────────────┐      ┌─────────────────────┐
           │  return null │      │  CacheService.get()  │
           └──────────────┘      └───────────┬─────────┘
                                             │
                               ┌─────────────┴─────────────┐
                               │                           │
                            HIT ◈                       MISS
                               │                           │
                               ▼                           ▼
                    ┌─────────────────┐      ┌──────────────────────┐
                    │  JSON.parse()   │      │  Sheets.getRange()   │
                    │  return session │      │  Batch A2:E          │
                    └─────────────────┘      └──────────┬───────────┘
                                                        │
                                                        ▼
                                              ┌──────────────────┐
                                              │  ¿Usuario en     │
                                              │  lista blanca?   │
                                              └────────┬─────────┘
                                                       │
                                          ┌────────────┴────────────┐
                                          │                         │
                                        NO ◈                       SÍ
                                          │                         │
                                          ▼                         ▼
                               ┌──────────────┐      ┌────────────────────┐
                               │  return null │      │  Construir UserDTO │
                               └──────────────┘      │  Cache.put(30min)  │
                                                     │  return session    │
                                                     └────────────────────┘
                                  │                         │
                    ┌─────────────┘                         │
                    │          ┌────────────────────────────┘
                    ▼          ▼
           ┌──────────────────────────┐
           │     renderSession()      │
           └────────────┬─────────────┘
                        │
              ┌─────────┴─────────┐
              │                   │
         null ◈              object
              │                   │
              ▼                   ▼
   ┌───────────────────┐  ┌────────────────────┐
   │ View_Error_Auth   │  │ Mostrar nav        │
   │ 🚫 No autorizado  │  │ Inyectar usuario   │
   └───────────────────┘  │ Cargar Dashboard   │
                          └────────────────────┘
```

---

## ◎ Estructura de Archivos

```
📦 jlangarica-division-servicios-administrativos/
│
├── 📄 package.json                     # Configuración del proyecto Node.js
├── 📄 .claspignore                     # Exclusiones para clasp deploy
│
└── 📂 src/                             # Código fuente de la aplicación
    │
    ├── 📄 appsscript.json              # Manifiesto de Apps Script
    │                                   #   • Zona horaria: America/New_York
    │                                   #   • Runtime: V8
    │                                   #   • Logging: Stackdriver
    │
    ├── 📄 Config.gs                    # Configuración global del sistema
    │                                   #   • SS_CONFIG_ID (Spreadsheet ID)
    │                                   #   • SHEETS (enum de hojas)
    │                                   #   • CACHE_CONFIG (TTL, prefijo)
    │
    ├── 📄 Main.gs                      # Punto de entrada HTTP
    │                                   #   • doGet(e) → HtmlService
    │                                   #   • include(filename) → string
    │
    ├── 📂 Services/                    # Capa de servicios (lógica de negocio)
    │   └── 📄 AuthService.gs           #   • getActiveUserSession()
    │                                   #   • CacheService (30 min TTL)
    │                                   #   • Batch read A2:E
    │                                   #   • UserDTO interface
    │
    └── 📂 ui/                          # Capa de presentación (HTML/CSS/JS)
        │
        ├── 📄 Index.html               # Shell principal de la SPA
        │                               #   • <nav> navegación sticky
        │                               #   • <div#app-root> contenedor SPA
        │                               #   • Loader de autenticación
        │                               #   • Google Fonts loader
        │
        ├── 📄 scripts.html             # Lógica del cliente (SPA Router)
        │                               #   • validateAccess()
        │                               #   • renderSession()
        │                               #   • navigateMenu()
        │                               #   • navigateToView()
        │                               #   • loadView()
        │                               #   • handleLogout()
        │                               #   • renderConnectionError()
        │
        ├── 📄 styles.html              # Design System completo
        │                               #   • Design tokens (CSS vars)
        │                               #   • Reset & base styles
        │                               #   • Navigation styles
        │                               #   • Card system
        │                               #   • Table system
        │                               #   • Button system
        │                               #   • Badge system
        │                               #   • Animations & transitions
        │                               #   • Responsive breakpoints
        │                               #   • Accessibility utilities
        │
        └── 📂 modules/                 # Vistas dinámicas (SPA views)
            ├── 📄 View_Dashboard.html  #   • Panel de control principal
            │                           #   • Stat cards con iconos
            │                           #   • Actividad reciente
            │
            ├── 📄 View_Requisiciones.html  # • Gestión de compras
            │                               # • Estado: en desarrollo
            │
            ├── 📄 View_Expedientes.html    # • Archivos digitales
            │                               # • Lista de archivos recientes
            │                               # • Integración Drive (WIP)
            │
            ├── 📄 View_Catalogos.html      # • Tabla de catálogos
            │                               # • Proveedores HCG
            │                               # • Partidas presupuestales
            │                               # • Unidades de medida
            │
            └── 📄 View_Error_Auth.html     # • Pantalla de acceso denegado
                                            # • Instrucciones de contacto
```

---

## ◎ Stack Tecnológico

<br>

<table>
<tr>
<td align="center" width="25%">

### 🖥️ Runtime

**Google Apps Script**
V8 Engine

</td>
<td align="center" width="25%">

### 📐 Lenguajes

**JavaScript** (GS)
**HTML5 / CSS3**

</td>
<td align="center" width="25%">

### 💾 Almacenamiento

**Google Sheets**
**CacheService**

</td>
<td align="center" width="25%">

### 🔐 Autenticación

**Session Service**
Lista blanca

</td>
</tr>
<tr>
<td align="center" width="25%">

### 🎨 Tipografía

**DM Serif Display**
**DM Sans**
**JetBrains Mono**

</td>
<td align="center" width="25%">

### 📱 Responsive

**CSS Grid**
**Flexbox**
3 breakpoints

</td>
<td align="center" width="25%">

### ✨ Animaciones

**CSS Keyframes**
**Custom Events**
Staggered reveals

</td>
<td align="center" width="25%">

### ♿ Accesibilidad

**ARIA roles**
**focus-visible**
WCAG contrast

</td>
</tr>
</table>

<br>

### Dependencias

```json
{
  "devDependencies": {
    "@types/google-apps-script": "^2.0.8"
  }
}
```

> El proyecto no tiene dependencias de producción. Toda la funcionalidad se construye con las APIs nativas de Google Apps Script y CSS/JS vanilla.

---

## ◎ Configuración del Entorno

### Prerrequisitos

| Herramienta | Versión mínima | Propósito                |
| :---------- | :------------- | :----------------------- |
| **Node.js** | ≥ 16.x         | CLI tooling              |
| **clasp**   | ≥ 2.x          | Despliegue a Apps Script |
| **Git**     | ≥ 2.x          | Control de versiones     |

### Pasos de Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/jlangarica/Division-Servicios-Administrativos.git
cd Division-Servicios-Administrativos

# 2. Instalar dependencias
npm install

# 3. Instalar clasp globalmente (si no está instalado)
npm install -g @google/clasp

# 4. Autenticar con Google
clasp login

# 5. Vincular con el proyecto de Apps Script existente
clasp clone <SCRIPT_ID>

# 6. Abrir en el editor de Apps Script
clasp open
```

### Variables de Configuración

| Constante                  | Archivo     | Valor             | Descripción                                |
| :------------------------- | :---------- | :---------------- | :----------------------------------------- |
| `SS_CONFIG_ID`             | `Config.gs` | `1BsQLunC...`     | ID del Google Spreadsheet de configuración |
| `SHEETS.USUARIOS`          | `Config.gs` | `"Usuarios"`      | Nombre de la hoja de usuarios autorizados  |
| `CACHE_CONFIG.TTL_SECONDS` | `Config.gs` | `1800`            | Tiempo de vida de caché (30 minutos)       |
| `CACHE_CONFIG.PREFIX`      | `Config.gs` | `"user_session_"` | Prefijo de keys en CacheService            |

---

## ◎ Despliegue

```bash
# Desplegar todos los archivos
clasp push

# Desplegar y abrir el editor
clasp push && clasp open

# Ver los logs en tiempo real
clasp logs --watch
```

> **Nota:** El archivo `.claspignore` excluye `node_modules/`, `.git/`, `package.json` y otros archivos de desarrollo del despliegue.

---

## ◎ Módulos del Sistema

<br>

```
                    ┌─────────────────────────────────────┐
                    │           🏠 DASHBOARD              │
                    │                                     │
                    │  ┌──────────┐ ┌──────────┐         │
                    │  │ 📦       │ │ 📝       │         │
                    │  │Inventario│ │Requisic. │         │
                    │  └──────────┘ └──────────┘         │
                    │  ┌──────────┐ ┌──────────┐         │
                    │  │ 📊       │ │ 🗂️       │         │
                    │  │Reportes  │ │Expedient.│         │
                    │  └──────────┘ └──────────┘         │
                    │                                     │
                    │  ┌─────────────────────────────┐   │
                    │  │ Actividad Reciente           │   │
                    │  └─────────────────────────────┘   │
                    └─────────────────────────────────────┘
                                       │
           ┌───────────────┬───────────┼───────────┐
           ▼               ▼           ▼           ▼
  ┌────────────────┐ ┌───────────┐ ┌─────────┐ ┌──────────┐
  │ 📝 REQUISICIONES│ │ 🗂️ EXPED. │ │ 📊 CATÁL.│ │ 🚫 ERROR │
  │                │ │           │ │         │ │          │
  │ "En desarrollo"│ │ Archivos  │ │ Tabla   │ │ Acceso   │
  │ Empty state    │ │ recientes │ │ dinámi- │ │ no auto- │
  │ con badge      │ │ Drive WIP │ │ ca      │ │ rizado   │
  └────────────────┘ └───────────┘ └─────────┘ └──────────┘
```

<br>

### Detalle por Módulo

| Módulo            | Archivo                   |  Estado   | Descripción                                                                          |
| :---------------- | :------------------------ | :-------: | :----------------------------------------------------------------------------------- |
| **Dashboard**     | `View_Dashboard.html`     | ✅ Activo | Panel principal con tarjetas estadísticas, saludo personalizado y actividad reciente |
| **Requisiciones** | `View_Requisiciones.html` |  🚧 WIP   | Creación y seguimiento de solicitudes de compra                                      |
| **Expedientes**   | `View_Expedientes.html`   |  🚧 WIP   | Consulta de archivos digitales y generación de PDFs                                  |
| **Catálogos**     | `View_Catalogos.html`     |  🚧 WIP   | Administración de proveedores, partidas presupuestales y unidades de medida          |
| **Error Auth**    | `View_Error_Auth.html`    | ✅ Activo | Pantalla de acceso denegado con instrucciones de contacto                            |

---

## ◎ Sistema de Caché

<br>

```
  PRIMERA PETICIÓN (CACHE MISS)
  ─────────────────────────────

  ┌──────────┐     ┌──────────┐     ┌──────────────────┐
  │ Usuario  │────►│ AuthSvc  │────►│ CacheService     │
  │          │     │          │     │ get(key) → null  │
  └──────────┘     └────┬─────┘     └──────────────────┘
                        │
                        ▼
               ┌──────────────────┐
               │ Google Sheets    │
               │ getRange(A2:E)   │
               │ find(userRow)    │
               └────────┬─────────┘
                        │
                        ▼
               ┌──────────────────┐
               │ CacheService     │
               │ put(key, json,   │
               │     1800)        │ ◄── 30 minutos TTL
               └────────┬─────────┘
                        │
                        ▼
               ┌──────────────────┐
               │ return UserDTO   │
               └──────────────────┘


  PETICIONES SUBSECUENTES (CACHE HIT)
  ────────────────────────────────────

  ┌──────────┐     ┌──────────┐     ┌──────────────────┐
  │ Usuario  │────►│ AuthSvc  │────►│ CacheService     │
  │          │     │          │     │ get(key) → JSON  │
  └──────────┘     └────┬─────┘     └────────┬─────────┘
                        │                     │
                        │   ┌─────────────────┘
                        ▼   ▼
               ┌──────────────────┐
               │ JSON.parse()     │
               │ return UserDTO   │
               │                  │
               │ ⚡ ~0ms vs ~2s   │
               └──────────────────┘
```

### UserDTO — Estructura de Datos

```javascript
/**
 * @typedef {Object} UserDTO
 * @property {string} id      - Identificador único (Columna A)
 * @property {string} name    - Nombre completo (Columna B)
 * @property {string} email   - Correo institucional (Columna C)
 * @property {string} role    - Rol del sistema (Columna D)
 * @property {string} prefix  - Tratamiento: Lic., Ing., Dr., etc. (Columna E)
 */
```

### Formato de la Hoja "Usuarios"

```
┌──────────┬───────────────────┬──────────────────────────┬────────────┬─────────┐
│  (A) ID  │  (B) Nombre       │  (C) Email               │  (D) Rol   │ (E) Pfx │
├──────────┼───────────────────┼──────────────────────────┼────────────┼─────────┤
│  1       │  Juan Pérez       │  jperez@hcg.gob.mx       │  Admin     │  Lic.   │
│  2       │  María López      │  mlopez@hcg.gob.mx       │  Comprador │  Ing.   │
│  3       │  Carlos Ruiz      │  cruiz@hcg.gob.mx        │  Consultor │  Dr.    │
└──────────┴───────────────────┴──────────────────────────┴────────────┴─────────┘
```

---

## ◎ Design System

<br>

### Paleta de Colores

```
  PRIMARY          ACCENT           HIGHLIGHT        SUCCESS          SURFACE
  ─────────        ─────────        ─────────        ─────────        ─────────

  ██████████       ██████████       ██████████       ██████████       ██████████
  #1a1a2e          #0f3460          #e94560          #0cce6b          #ffffff
  ████ Deep        ████ Navy        ████ Coral       ████ Emerald     ████ White
  ██████████       ██████████       ██████████       ██████████       ██████████

  TEXT PRIMARY     TEXT SECONDARY   TEXT MUTED        SUBTLE           BORDER
  ─────────        ─────────        ─────────        ─────────        ─────────

  ██████████       ██████████       ██████████       ██████████       ██████████
  #1a1a2e          #5a6072          #9aa0b4          #f4f5f7          rgba(0,0,0,.06)
  ████ Dark        ████ Mid         ████ Light       ████ Ghost       ████ Ultra-light
  ██████████       ██████████       ██████████       ██████████       ██████████
```

### Tipografía

| Rol         | Familia            | Uso                                            |
| :---------- | :----------------- | :--------------------------------------------- |
| **Display** | `DM Serif Display` | Títulos principales, headings de página        |
| **Body**    | `DM Sans`          | Texto general, botones, labels, navegación     |
| **Mono**    | `JetBrains Mono`   | Código inline, datos técnicos, identificadores |

### Sistema de Sombras

```
  shadow-xs         shadow-sm         shadow-md         shadow-lg         shadow-xl
  ──────────        ──────────        ──────────        ──────────        ──────────
  ▓▓                ▓▓▓               ▓▓▓▓▓             ▓▓▓▓▓▓▓           ▓▓▓▓▓▓▓▓▓
  ░░                ░░░░              ░░░░░░░           ░░░░░░░░░         ░░░░░░░░░░░
  1px · 2px         2px · 8px         4px · 16px        8px · 32px        16px · 48px
  0.04α             0.06α             0.08α             0.10α             0.12α
```

---

## ◎ Guía de Estilo del Código

<br>

### Convenciones en Google Apps Script (.gs)

```javascript
// ✅ Constantes en UPPER_SNAKE_CASE
const SS_CONFIG_ID = "1BsQLunC...";

// ✅ Enums con Object.freeze()
const SHEETS = Object.freeze({
  USUARIOS: "Usuarios"
});

// ✅ JSDoc completo para funciones públicas
/**
 * Obtiene la sesión del usuario activo.
 * @returns {UserDTO | null}
 */
function getActiveUserSession() { ... }

// ✅ Logs categorizados
console.log("AuthService: Sesión recuperada de caché");
console.warn("AuthService: Acceso denegado");
console.error("AuthService: Error →", error);
```

### Convenciones en HTML/CSS

```html
<!-- ✅ BEM-inspired naming con prefijos semánticos -->
<div class="stat-card card-interactive">
  <div class="stat-icon">📦</div>
  <div class="stat-label">Inventario</div>
  <div class="stat-value">—</div>
</div>

<!-- ✅ CSS Custom Properties para todo -->
<h1 style="color: var(--color-primary);">Título</h1>

<!-- ✅ ARIA en elementos interactivos -->
<button
  class="nav-btn"
  role="tab"
  aria-selected="true"
  data-view="..."
></button>
```

### Convenciones en JavaScript (Cliente)

```javascript
// ✅ Estado global declarado al inicio
let currentUser = null;
let currentViewPath = null;

// ✅ Event delegation con data attributes
document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
  btn.addEventListener("click", (e) => navigateMenu(e, btn.dataset.view));
});

// ✅ Transiciones con fallback timeout
existing.addEventListener(
  "animationend",
  () => {
    loadView(viewPath);
  },
  { once: true },
);
setTimeout(() => loadView(viewPath), 200); // Fallback
```

---

## ◎ Flujo de Navegación SPA

```
                          ┌───────────────┐
                          │  Index.html   │
                          │  (Shell)      │
                          └───────┬───────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │    #app-root              │
                    │    (Contenedor dinámico)  │
                    └──────────────┬───────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
     ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
     │ navigateToView │  │ navigateToView │  │ navigateToView │
     │ ()             │  │ ()             │  │ ()             │
     └───────┬────────┘  └───────┬────────┘  └───────┬────────┘
             │                   │                    │
             ▼                   ▼                    ▼
     ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
     │ 1. view-exit   │  │ 1. view-exit   │  │ 1. view-exit   │
     │ 2. loadView()  │  │ 2. loadView()  │  │ 2. loadView()  │
     │ 3. view-enter  │  │ 3. view-enter  │  │ 3. view-enter  │
     └───────┬────────┘  └───────┬────────┘  └───────┬────────┘
             │                   │                    │
             ▼                   ▼                    ▼
     ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
     │  Dashboard     │  │ Requisiciones  │  │  Catálogos     │
     │  .html         │  │ .html          │  │  .html         │
     └────────────────┘  └────────────────┘  └────────────────┘
```

### Ciclo de Vida de una Vista

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │  CLICK   │───►│  EXIT    │───►│  LOAD    │───►│  ENTER   │
  │  en menú │    │  actual  │    │  nueva   │    │  nueva   │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘
                     │                │                │
                     ▼                ▼                ▼
               view-exit         include()        view-enter
               150ms fade        Server call      700ms reveal
               translateY(-8)    + innerHTML       translateY(12→0)
                                                    opacity(0→1)
```

---

## ◎ Rendimiento y Optimización

<br>

| Técnica                 | Implementación                                    | Impacto                                                |
| :---------------------- | :------------------------------------------------ | :----------------------------------------------------- |
| **Cache de sesiones**   | `CacheService.getScriptCache()` con TTL de 30 min | Elimina lecturas repetidas al Spreadsheet (~2s → ~0ms) |
| **Batch read**          | `getRange("A2:E" + lastRow).getValues()`          | Una sola llamada al Spreadsheet en lugar de N filas    |
| **Búsqueda en memoria** | `Array.find()` sobre datos precargados            | O(n) en RAM vs O(n) con llamadas I/O                   |
| **SPA sin recarga**     | `google.script.run.include()` dinámico            | Sin recarga completa de página entre vistas            |
| **CSS animations**      | `@keyframes` + `animation-delay`                  | GPU-accelerated, sin dependencias JS                   |
| **Passive listeners**   | `{ passive: true }` en scroll                     | Mejora scroll performance en mobile                    |
| **Font preconnect**     | `<link rel="preconnect">`                         | Reduce latencia de carga de Google Fonts               |
| **Backdrop-filter**     | `blur(20px) saturate(1.8)`                        | Efecto glassmorphism nativo del browser                |

---

## ◎ Roadmap

<br>

```
  ╔═══════════════════════════════════════════════════════════════╗
  ║                                                               ║
  ║   v1.0.0 ✅              v1.1.0 🚧              v2.0.0 💡    ║
  ║   ─────────              ─────────              ─────────    ║
  ║                                                               ║
  ║   ◉ Auth + Cache         ◉ CRUD Requisiciones   ◉ Drive API  ║
  ║   ◉ SPA Router           ◉ Catálogos activos    ◉ PDF Gen    ║
  ║   ◉ Design System        ◉ Búsqueda y filtros   ◉ Notificac. ║
  ║   ◉ Dashboard            ◉ Estados de flujo     ◉ Reportes   ║
  ║   ◉ Error handling        ◉ Validación formularios ◉ Multirol ║
  ║                                                               ║
  ║   ●───────────────────────●───────────────────────●           ║
  ║   Completado              En progreso             Planeado    ║
  ║                                                               ║
  ╚═══════════════════════════════════════════════════════════════╝
```

---

## ◎ Contacto y Soporte

<br>

<table>
<tr>
<td width="50%">

### 🏥 Institucional

**Hospital Civil de Guadalajara**
División de Servicios Administrativos
Departamento de Sistemas

</td>
<td width="50%">

### 💻 Desarrollo

**Repositorio:** [GitHub](https://github.com/jlangarica/Division-Servicios-Administrativos)
**Issues:** [Reportar problema](https://github.com/jlangarica/Division-Servicios-Administrativos/issues)

</td>
</tr>
</table>

---

<div align="center">

<br>

**◈ Sistema de Compras HCG** · División de Servicios Administrativos

Construido con **Google Apps Script** · Runtime **V8** · Diseño **DM Sans + DM Serif Display**

<br>

![Made with](https://img.shields.io/badge/Made%20with-Google%20Apps%20Script-4285F4?style=flat-square&logo=google)
![Architecture](https://img.shields.io/badge/Architecture-SPA-1a1a2e?style=flat-square)
![Design](https://img.shields.io/badge/Design-Custom%20Design%20System-e94560?style=flat-square)

</div>
