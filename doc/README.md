# 📖 Transformer Documentation & Notebooks

This folder contains deep-dive documentation and interactive Jupyter Notebooks for exploring the mathematical concepts of the **Transformer** model architecture.

## 📓 Notebooks

- **[transformer_districts_explained.ipynb](file:///e:/repositories/transformer/doc/transformer_districts_explained.ipynb)**: Complete district-by-district breakdown covering math formulas and step-by-step NumPy code implementations for all 13 stages.

---

## 🚀 Virtual Environment Setup

To run the Jupyter Notebook locally in an isolated Python environment, follow these steps:

### 1. Create & Activate Virtual Environment

**On Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**On Linux / macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r doc/requirements.txt
```

### 3. Launch Jupyter Notebook

```bash
jupyter notebook doc/transformer_districts_explained.ipynb
```
