# Food Printing Quality Calculator  
(README in English & Português)

<!-- Badges -->
![Version](https://img.shields.io/github/v/tag/larissachlopes/Food-Printing-Quality-Calculator?label=version&color=blue)
![Platform](https://img.shields.io/badge/platform-Windows-blueviolet)
![Tech](https://img.shields.io/badge/built%20with-React%20%7C%20Electron%20%7C%20JavaScript-9cf)
![Downloads](https://img.shields.io/github/downloads/larissachlopes/Food-Printing-Quality-Calculator/total?color=brightgreen)
![Status](https://img.shields.io/badge/status-Stable-success)
![License](https://img.shields.io/badge/license-Software%20Registered%20%2F%20Proprietary-red)

The **Food Printing Quality Calculator** is a desktop application designed to evaluate the quality of **3D-printed foods**.  
It integrates structural, dimensional, extrusion, and printing-process parameters into a unified scoring system, generating standardized quality assessments and technical recommendations.

---

## ✨ Key Features (highlights)

- **Quality scoring across 7 critical parameters**:  
  Dimensional accuracy, layer adhesion, extrusion consistency, structural quality, surface finish, fill uniformity, and print precision.
- **Weighted final score** with classification: *Unsatisfactory, Fair, Good, Excellent*.
- **Automated recommendations** based on detected weaknesses.
- **Sample history** with searchable tables and line charts.
- **PDF export** with full structured reports (score breakdown, weighted scores, parameters, metadata).
- **Selectable samples**: generate PDF, CSV or charts only for chosen entries.
- **Editable parameter weights** + presets (Balanced, Quality, Speed) + Normalize Weights.
- **Multilingual interface** (English & Portuguese).
- **Photo support** (v2.1.0): upload a photo per sample, thumbnail preview in history, view original image in separate window, and cleanup tool to remove unused photos.
- **Windows installer (.exe)** included in Releases.

---

## 📥 Download

Download the latest **Windows .exe** under the **Releases** tab of this repository.

---

## ✅ How to verify the installer (recommended)

Because this app is not signed with a code-signing certificate, Windows SmartScreen may show a "publisher unknown" warning. To increase safety and transparency, we publish a SHA-256 checksum for each release.

To generate/verify the checksum locally (PowerShell):
# on the machine where you downloaded the installer
Get-FileHash -Algorithm SHA256 .\FoodPrintingInstaller.exe | Format-List
Compare the Hash value with the SHA-256 value published on the Release page. If they match, the file is authentic.
If SmartScreen shows a warning, you can:
Click More info → Run anyway, or
Right-click the downloaded file → Properties → Unblock → OK, then run it.

---

## 📄 Intellectual Property

This software is protected under Brazilian Law 9.609/1998 as a Registered Computer Program, officially filed as:
📌 “Calculadora de Qualidade de Impressão 3D de Alimentos”
FURG / OCEANTEC – Institutional Registration
Commercial distribution, modification, or sublicensing requires prior written authorization from the authors and/or the Intellectual Property Office of FURG.

---

## 👥 Authors / Inventors
LOPES, L. C.; COSTA, J. A. V.; ROSA, G. M.
For questions, licensing, collaborations, or research use:
📧 larissachlopes@gmail.com

---

## 🇧🇷 Versão em Português — resumo
A Calculadora de Qualidade de Impressão 3D de Alimentos é um aplicativo desktop para avaliação padronizada da qualidade de alimentos impressos em 3D.

---

## ✨ Funcionalidades principais
Avaliação por 7 parâmetros críticos (precisão dimensional, adesão entre camadas, consistência da extrusão, qualidade estrutural, acabamento superficial, uniformidade do preenchimento, precisão de impressão).
Exportação de relatórios em PDF, histórico de amostras, seleção múltipla, presets de pesos e interface bilíngue.
Novo (v2.1.0): upload de foto por amostra, miniatura no histórico, visualização da imagem original e ferramenta para limpar fotos não referenciadas.

---

## Download e verificação
A versão mais recente (.exe) está na aba Releases. Recomendamos verificar o hash SHA-256 publicado no Release antes de executar o instalador.
