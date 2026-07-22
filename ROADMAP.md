# 🛣️ Roadmap do Projeto: Controle de Plano de Testes

Este documento descreve o histórico de desenvolvimento e as próximas iterações planejadas para o "Controle de Plano de Testes". Nosso objetivo é aprimorar continuamente a ferramenta, tornando-a ainda mais robusta, escalável e amigável para as equipes internas.

## ✅ Concluído

### Fase 1: Refinamento Visual e Correção de Bugs
* [cite_start]**1.1 Ajuste em Bugs Visuais:** Correção de inconsistências na interface do usuário, com foco na exibição de evidências em diferentes navegadores.
* [cite_start]**1.2 Adequação Visual de Cores e Ícones:** Revisão e padronização da paleta de cores e ícones para melhorar a coesão visual e a usabilidade.

### Fase 2: Melhorias de Fluxo e Persistência
* [cite_start]**2.1 Incluir Função de Resposta do Desenvolvedor:** Implementada a seção de comentários técnicos para facilitar a comunicação entre QA e Desenvolvimento.
* [cite_start]**2.2 Incluir Função de Usar `localStorage`:** Implementado o uso do `localStorage` para salvar e gerenciar múltiplos projetos, permitindo que os dados persistam entre sessões de forma transparente.

---

## 🚀 Próximas Iterações

As seguintes são as prioridades para as próximas fases de desenvolvimento, focadas em otimização de performance e sustentabilidade a longo prazo.

### 🎯 Fase 3: Otimização de Performance e Armazenamento (Médio Prazo)

Foco em resolver os gargalos de performance identificados para projetos com grande volume de dados.

* **3.1 Otimização de Armazenamento de Evidências:**
    * [cite_start]**Descrição:** Atualmente, as evidências são salvas em Base64, o que pode causar lentidão e alto consumo de memória com muitos vídeos. A proposta é migrar o armazenamento de evidências pesadas para uma solução mais eficiente.
    * **Opções de Implementação:**
        1. [cite_start]**IndexedDB:** Utilizar o banco de dados do navegador (`IndexedDB`) para armazenar blobs de mídia, aliviando a carga do objeto de dados principal.
        2. [cite_start]**Servidor de Arquivos Externo:** Desenvolver um sistema de upload para um servidor de arquivos, onde apenas o link da evidência seria salvo no projeto.
    * **Meta:** Garantir que a aplicação permaneça rápida e responsiva, mesmo com planos de teste extensos e com muitas evidências em vídeo.

* **3.2 Otimização da Manipulação do DOM:**
    * [cite_start]**Descrição:** Refatorar partes do código que manipulam a interface para evitar operações custosas em loops, especialmente ao carregar ou filtrar um grande número de casos de teste.
    * **Meta:** Melhorar a fluidez e a velocidade de resposta da interface do usuário.

### 🎯 Fase 4: Robustez e Manutenibilidade (Longo Prazo)

Garantir a confiabilidade e a facilidade de manutenção da ferramenta no futuro.

* **4.1 Tratamento de Erros Avançado:**
    * [cite_start]**Descrição:** Implementar um sistema de tratamento de erros mais robusto, especialmente para operações de importação de arquivos JSON e falhas nas chamadas de APIs de mídia, fornecendo feedback claro e útil ao usuário em caso de falha.
    * **Meta:** Aumentar a confiabilidade da aplicação e facilitar a identificação de problemas pelos usuários.

* **4.2 Testes de Compatibilidade entre Navegadores:**
    * [cite_start]**Descrição:** Realizar e documentar um ciclo completo de testes de compatibilidade nos principais navegadores (Chrome, Firefox, Edge, Safari) para garantir que todas as funcionalidades, especialmente as Web APIs, funcionem de forma consistente.
    * **Meta:** Assegurar uma experiência de usuário uniforme e sem falhas, independentemente do navegador utilizado.

* **4.3 Gestão de Dependências:**
    * **Descrição:** Avaliar a atualização das dependências externas (`Chart.js`, `Mammoth.js`, `Mermaid.js`) para suas versões estáveis mais recentes. [cite_start]Alternativamente, considerar incluir as bibliotecas localmente no projeto para evitar quebras por atualizações em CDNs externas.
    * **Meta:** Manter a segurança e a estabilidade da aplicação, prevenindo problemas causados por dependências desatualizadas.

## Contribuições

Este roadmap é um guia e está sujeito a alterações com base nas necessidades da equipe, feedback dos usuários e prioridades da empresa. Encorajamos a equipe a reportar bugs e sugerir melhorias através dos canais internos apropriados.

---