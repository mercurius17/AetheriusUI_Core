# ADR 0003: catálogo atual de navegação

- Status: aceito conforme o prompt v2 desta tarefa.
- Contexto: o PDF técnico mais antigo descreve dez posições externas e não inclui `shop`; o prompt v2 e `agent.md` atuais definem onze posições externas, incluindo `shop`, e proíbem páginas finais de domínio no Core.
- Decisão: implementar `character` no centro e onze slots externos fixos (`class`, `spells`, `party`, `inventory`, `server`, `map`, `professions`, `supernatural`, `properties`, `house`, `shop`). Ausência de registro gera estado indisponível no mesmo slot. `shop` de demo é fixture vazia.
- Consequências: o catálogo segue a instrução atual do proprietário; PDFs anteriores continuam referência visual/funcional, não substituem a composição de 12 destinos.

