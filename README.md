# SysML v2 Visual Editor (Prototype v0.1)

A lightweight, web-based SysML v2 visualization and editing environment designed to help practitioners learn, adopt, and experiment with the SysML v2 language without the heavy overhead of traditional modeling suites.

## 🚀 Mission: Removing Entry Barriers
The transition to SysML v2 represents a significant paradigm shift from graphical-first to combined textual/graphical modeling. This project aims to lower the barrier to entry by providing:
- **Instant Visualization**: Real-time rendering of SysML v2 textual syntax into interactive diagrams.
- **Lightweight Experience**: No installation required; runs entirely in the browser.
- **Interactive Learning**: A library of draggable templates and complex examples (like a Mars Rover) to see SysML v2 in action.

## ✨ Core Features
- **Code-Diagram Sync**: Integrated Monaco Editor with live parsing and bi-directional navigation.
- **Multiple Perspectives**: Visualize your model through General, Interconnection, Action Flow, State Transition, and Requirements views.
- **Interactive Editing**: 
  - Drag-and-drop elements from the Library.
  - Context-menu based focusing and attribute management.
  - Property panel for precision attribute editing.
- **Traceability**: Automated visualization of `satisfy` and `verify` relationships.
- **Smart Navigation**: Auto-zoom/pan to focused elements to maintain context in large models.

## 🌐 Live Version
Experience the editor live at:  
**[https://haitaowu12.github.io/sysmlv2_viewer/](https://haitaowu12.github.io/sysmlv2_viewer/)**

## 🛠️ Local Development

### Prerequisites
- Node.js (v18+)
- npm

### Setup
```bash
# Clone the repository
git clone https://github.com/haitaowu12/sysmlv2_viewer.git

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build
```bash
npm run build
```

## ⚠️ Prototype Status
This is a **Prototype v0.1** version. It supports a significant subset of the SysML v2 textual notation but is not yet a complete implementation of the full language specification. Contributions and feedback are welcome as we refine the parsing and rendering engines.

## ⚖️ License
MIT License
