# ⚡ Transformer — The Engine of Generative AI

> **"Generative AI exists because of the transformer."**  
> — Inspired by the Financial Times visual investigation ([ig.ft.com/generative-ai](https://ig.ft.com/generative-ai/))

Welcome to **Transformer**, an interactive, real-time 3D isometric simulation that visualizes how Large Language Models (LLMs) think, compute, and generate text. Every district in this virtual grid represents a stage of the Transformer neural network architecture, and a convoy of trucks carries hidden state vectors from tokenization to final output sampling.

---

## 🌟 The Core Highlight: Why Generative AI Exists Because of the Transformer

Before 2017, natural language processing relied on recurrent neural networks (RNNs and LSTMs). These models processed text **one word at a time, sequentially**. This created two fundamental flaws:
1. **Training Bottleneck:** Sequential processing meant models could not leverage modern GPU parallelization effectively.
2. **Context Loss:** As sequences grew longer, early information faded away—models suffered from "catastrophic forgetting."

### The 2017 Breakthrough: *Attention Is All You Need*

In 2017, researchers at Google published the landmark paper *"Attention Is All You Need"*, introducing the **Transformer** architecture. The transformer eliminated recurrence entirely in favor of **Self-Attention**:

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

- **Parallel Processing:** Entire sequences are ingested simultaneously rather than step-by-step.
- **Dynamic Context (Self-Attention):** Every token can look at and weigh every other token in the sequence simultaneously, regardless of distance.
- **Infinite Scalability:** This architecture unlocked massive scaling across billions of parameters and trillions of tokens, powering modern Generative AI: ChatGPT, Claude, Gemini, LLaMA, and Diffusion Transformers (Sora, Midjourney v6).

---

## 🏛️ Transformer: The Architecture Visualized

To make these complex matrix operations intuitive, **Transformer** maps the neural network directly onto an interactive isometric layout.

```
[ Prompt Text ]
       │
       ▼
 [ Tokenizer Docks ] ──► [ Embedding Foundry ] ──► [ Positional Beacon ]
                                                           │
┌──────────────────────────────────────────────────────────┘
│  ┌──────────────────────────────────────────────────────┐
▼  ▼                                                      │
[ Pre-Norm Gate ]                                         │
       │                                                  │
       ▼                                                  │ (Layer Loop)
[ Attention Plaza ] ◄──► [ KV Cache Warehouse ]           │
       │                                                  │
       ▼                                                  │
[ Residual Bridge ]                                       │
       │                                                  │
       ▼                                                  │
[ Feed-Forward Mill ] ──► [ Layer Counter Arch ] ─────────┘
                               │ (All layers complete)
                               ▼
                    [ Vocabulary Stadium ]
                               │
                               ▼
                        [ The Sampler ]
                               │
                               ▼
                       [ Output Plaza ] ──► (Emitted Token)
                               │
                               └──► [ Feedback Highway ] ──► (Autoregression)
```

### 🏬 District Tour & Mathematical Mapping

| District | Transformer Stage | Mathematical / Conceptual Role |
| :--- | :--- | :--- |
| 🚢 **Tokenizer Docks** | Subword Tokenization | Splits raw input text string into discrete integer token IDs ($x_1, x_2, \dots, x_n$). |
| 🏭 **Embedding Foundry** | Token Embedding Matrix ($W_E$) | Maps discrete token IDs to dense high-dimensional vectors ($e_i \in \mathbb{R}^{d_{model}}$). |
| 📍 **Positional Beacon** | Positional Encoding ($PE$) | Adds sinusoidal signal ($PE_{(pos, 2i)} = \sin(pos/10000^{2i/d})$) to preserve word order in parallel processing. |
| ⚖️ **Pre-Norm Gate** | Layer Normalization ($\text{LN}$) | Standardizes vector activations ($\mu=0, \sigma=1$) before each sub-layer for stable deep training. |
| 🎯 **Attention Plaza** | Multi-Head Self-Attention | Computes Query ($Q$), Key ($K$), Value ($V$) projections and applies scaled dot-product attention with causal masking. |
| 📦 **KV Cache Warehouse** | Key-Value Cache Storage | Stores computed $K$ and $V$ vectors for past tokens to prevent duplicate computation during autoregressive decoding. |
| 🌉 **Residual Bridge** | Residual Connections | Adds input directly to sub-layer output ($x + \text{SubLayer}(x)$), enabling smooth gradient flow through deep networks. |
| ⚙️ **Feed-Forward Mill** | MLP / FFN Block | Two linear projections with non-linear activation ($d_{model} \to 4d_{model} \to d_{model}$ using GELU activation). |
| 🏛️ **Layer Counter Arch** | Transformer Block Stacking | Routes hidden state through $N$ repeated Transformer layers (each with independent weights). |
| 🏟️ **Vocabulary Stadium** | Unembedding & Softmax Logits | Projects final vector onto vocabulary dimension ($W_U$) and calculates softmax probability distribution $P(w_i)$. |
| 🎲 **The Sampler** | Temperature & Nucleus Sampling | Applies Temperature scaling ($T$) and Top-$P$ (nucleus) cutoffs, then samples the next token. |
| 📺 **Output Plaza** | Token Emitting | Displays the newly generated token on the central Jumbotron. |
| 🛣️ **Feedback Highway** | Autoregressive Loop | Feeds the generated token back to the input prompt, repeating generation word-by-word. |

---

## ⚡ Live Computation in the Browser

This is **not** a video or pre-rendered animation. The simulation executes a genuine, functional miniature Transformer model inside JavaScript in real-time:

- ✅ **Real Matrix Math:** Computes actual dot-product attention, vector embeddings, residual additions, LayerNorm, and GELU activations.
- ✅ **Live KV Cache:** Visualizes key/value beams connecting current decoding tokens to historical context in real time.
- ✅ **Interactive Sampler:** Adjusting **Temperature** and **Top-$P$** sliders dynamically reshapes the real softmax probability distribution live at the Stadium.
- ✅ **Zero Dependencies:** Pure static HTML, CSS, and Vanilla JavaScript—no heavy frameworks, PyTorch server backend, or WebGL required.

*(Note: To keep output text readable in a lightweight browser model, final logits blend real hidden states with a small bigram prior corpus).*

---

## 🚀 Getting Started

### 1. Run Locally
Because this project is built as a pure static site, you can run it directly:

- **Option A:** Simply double-click `index.html` to open it in any modern browser.
- **Option B:** Serve via Python's built-in HTTP server:
  ```bash
  python -m http.server 8000
  # Then navigate to http://localhost:8000
  ```

---

## 🎮 Controls & Interaction

| Key / Input | Action |
| :--- | :--- |
| <kbd>Space</kbd> | **Play / Pause** (freezes the current convoy stage and reading stop) |
| <kbd>S</kbd> | **Step** forward by exactly one district/stage |
| <kbd>R</kbd> | **Reset** simulation and start the slow guided tour |
| <kbd>F</kbd> | Toggle **Camera Follow** mode |
| <kbd>L</kbd> | Toggle **District Labels** overlay |
| **Drag** | Pan across the scene grid |
| **Scroll** | Zoom in / Zoom out |
| **Double-Click** / <kbd>⤢</kbd> | Fit entire scene view |
| **Click District** | Pin detailed architectural explanation panel |

---

## 📂 Project Structure

```
├── .github/
│   └── workflows/
│       └── deploy-pages.yml                 # GitHub Actions workflow for automatic Pages deployment
├── doc/
│   ├── README.md                            # Documentation and virtual environment setup guide
│   ├── requirements.txt                      # Python dependencies for the Jupyter Notebook environment
│   └── transformer_districts_explained.ipynb # Interactive Jupyter Notebook covering math & Python code for all 13 districts
├── index.html                               # Main HTML entry point, HUD controls, modal copy
└── src/
    ├── css/
    │   └── styles.css                       # Premium light, print-inspired UI styling
    └── js/
        ├── iso.js                           # Custom 3D isometric projection engine & primitive rendering
        ├── toy-model.js                     # Browser-side Transformer math (Tokenizer, Attention, GELU, Sampler)
        ├── city.js                          # Map routes, station coordinates, building geometry
        ├── sim.js                           # State machine orchestrating convoy movements & model execution
        ├── render.js                        # Painter's-algorithm Canvas 2D render loop
        ├── ui.js                            # Interactive HUD, narration panels, and control bindings
        └── main.js                          # Input handlers, camera state, and animation request loop
```

---

## 📚 References & Inspiration

- **Financial Times Interactive:** [Generative AI exists because of the transformer](https://ig.ft.com/generative-ai/)
- **Original Paper:** Vaswani et al. (2017) [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- **Prior Art:** Inspired by Nikolay Shamgunov's [PGSimCity](https://nikolays.github.io/PGSimCity/).

---

<p align="center">
Made with ❤️ to make Transformer architectures accessible and visually intuitive for everyone.
</p>