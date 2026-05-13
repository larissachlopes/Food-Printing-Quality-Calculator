# Food Printing Quality Calculator  
*(README in English & Português)*

<!-- Badges -->
![Version](https://img.shields.io/github/v/tag/larissachlopes/Food-Printing-Quality-Calculator?label=version&color=blue)
![Platform](https://img.shields.io/badge/platform-Windows-blueviolet)
![Tech](https://img.shields.io/badge/built%20with-React%20%7C%20Electron%20%7C%20JavaScript-9cf)
![Downloads](https://img.shields.io/github/downloads/larissachlopes/Food-Printing-Quality-Calculator/total?color=brightgreen)
![Status](https://img.shields.io/badge/status-Stable-success)
![License](https://img.shields.io/badge/license-Software%20Registered%20%2F%20Proprietary-red)

The **Food Printing Quality Calculator** is a desktop application designed for standardized evaluation of **3D-printed food products**.  
The software integrates objective measurements and qualitative assessments into a unified weighted scoring system, enabling systematic quality analysis, traceability, and technical reporting for food printing experiments.

The latest version introduces the **3DFPQ (3D Food Printing Quality) System**, a redesigned evaluation methodology combining instrumental measurements with standardized visual criteria.

---

# 🚀 Version 3.0 — 3DFPQ Quality System

The new **3DFPQ evaluation model** combines:

- **1 objective parameter** automatically converted from instrumental measurements
- **5 qualitative parameters** assessed through standardized criteria
- **Weighted quality index calculation**
- **Integrated recommendations** based on score performance

## 📊 Quality Index Formula

```text
Q = Σ(wᵢ · Sᵢ) / Σwᵢ
```

| Parameter | Type | Weight |
|---|---|---|
| Dimensional Fidelity | ⚗ Objective (Print Precision %) | 30% |
| Layer Adhesion | 👁 Qualitative — post-print | 25% |
| Extrusion Consistency | 👁 Qualitative — during print | 20% |
| Structural Quality | 👁 Qualitative — post-print | 15% |
| Surface Finish | 👁 Qualitative — post-print | 5% |
| Fill Uniformity | 👁 Qualitative — post-print | 5% |

---

# ✨ Key Features

## 🧪 Standardized Quality Evaluation

- Automatic conversion of caliper-based measurements into quality scores
- Standardized visual scoring criteria for reproducible assessments
- Weighted final quality index calculation
- Classification system for print quality interpretation
- Literature-supported recommendations for each parameter and score range

## 📋 Evaluation Workflow

### Evaluation Tab

Users can:

- Register sample metadata and formulation information
- Store printing parameters for traceability
- Upload sample photos (JPG / PNG)
- Insert Print Precision (%) measurements obtained via caliper
- Automatically calculate the Dimensional Fidelity score
- Evaluate qualitative parameters using integrated scoring guides
- Save results locally in the sample history database

### Scoring Guide Tab

The application includes:

- Standardized visual criteria
- Score conversion references
- Parameter-by-parameter assessment instructions

> **Important:**  
> Extrusion Consistency must be evaluated during the printing process, while the remaining qualitative parameters are assessed after printing.

### History & Export

- Searchable sample history
- Interactive score charts
- Full parameter breakdown per sample
- PDF export (single sample or full history)
- CSV export with detailed parameter scores
- Thumbnail preview and original image visualization

---

# 🌍 Additional Features

- **Bilingual interface** (English / Portuguese)
- **Sample photo support**
- **Historical data visualization**
- **Structured PDF reporting**
- **CSV export tools**
- **Traceability fields**:
  - Expansion rate
  - Apparent density
  - Formulation notes
  - Printing parameters
- **Windows installer (.exe)** available in Releases

---

# 📥 Download

Download the latest **Windows installer (.exe)** from the **Releases** section of this repository.

---

# ✅ Installer Verification (Recommended)

Because the application is currently not code-signed, Windows SmartScreen may display a “Publisher Unknown” warning.

To improve transparency and security, a SHA-256 checksum is published for every release.

Generate and verify the checksum locally using PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 .\FoodPrintingInstaller.exe | Format-List
```

Compare the generated hash with the SHA-256 value published in the Release notes.

If SmartScreen displays a warning:

1. Click **More info**
2. Select **Run anyway**

Alternatively:

1. Right-click the installer
2. Open **Properties**
3. Check **Unblock**
4. Click **OK**

---

# 📄 Intellectual Property

This software is protected under Brazilian Law 9.609/1998 as a Registered Computer Program, officially filed as:

📌 **“Calculadora de Qualidade de Impressão 3D de Alimentos”**  
FURG / OCEANTEC – Institutional Registration

Commercial distribution, sublicensing, or modification requires prior written authorization from the authors and/or the Intellectual Property Office of FURG.

---

# 👥 Authors / Inventors

**LOPES, L. C.; COSTA, J. A. V.; ROSA, G. M.**

For questions, licensing, collaborations, or academic use:

📧 **larissachlopes@gmail.com**

---

# 🇧🇷 Versão em Português

A **Calculadora de Qualidade de Impressão 3D de Alimentos** é um aplicativo desktop desenvolvido para avaliação padronizada da qualidade de alimentos impressos em 3D.

A versão 3.0 introduz o sistema **3DFPQ (3D Food Printing Quality)**, que combina medições instrumentais com critérios qualitativos padronizados para análise sistemática da qualidade de impressão.

---

# ✨ Funcionalidades Principais

## 🧪 Avaliação Padronizada

- Conversão automática de medições obtidas por paquímetro em escores de qualidade
- Critérios visuais padronizados para avaliação qualitativa
- Cálculo de índice de qualidade ponderado
- Recomendações automáticas baseadas nos resultados
- Sistema estruturado para rastreabilidade experimental

## 📋 Fluxo de Avaliação

### Aba de Avaliação

O usuário pode:

- Registrar informações da amostra e formulação
- Salvar parâmetros de impressão
- Adicionar fotos da amostra
- Inserir valores de precisão de impressão (%)
- Calcular automaticamente o escore de fidelidade dimensional
- Avaliar os parâmetros qualitativos
- Salvar os resultados no histórico local

### Guia de Pontuação

Inclui:

- Critérios visuais padronizados
- Tabelas de conversão
- Instruções para avaliação de cada parâmetro

> **Importante:**  
> A consistência da extrusão deve ser avaliada durante a impressão, enquanto os demais parâmetros qualitativos são avaliados após a impressão.

### Histórico e Exportação

- Histórico pesquisável
- Gráficos de desempenho
- Exportação em PDF
- Exportação em CSV
- Visualização de imagens das amostras

---

# 📥 Download e Verificação

A versão mais recente (.exe) está disponível na aba **Releases**.

Recomenda-se verificar o hash SHA-256 publicado antes da execução do instalador.
