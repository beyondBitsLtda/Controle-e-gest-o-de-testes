# Controle de Plano de Testes

![Status](https://img.shields.io/badge/status-ativo-brightgreen)

Uma aplicação web client-side interna para gerenciar, documentar e acompanhar casos de teste de software.

![Captura de Tela da Aplicação](https://i.imgur.com/link-para-sua-imagem.png)
*(Recomendação: Substitua o link acima por uma captura de tela real da sua aplicação)*

## 📜 Sobre o Projeto

O "Controle de Plano de Testes" foi desenvolvido como uma ferramenta interna para auxiliar nossas equipes de QA e desenvolvimento na organização e acompanhamento de casos de teste. Ele opera 100% no navegador, permitindo um controle ágil e a documentação de evidências, com a possibilidade de salvar e carregar históricos de testes.

## ✨ Funcionalidades

* **➕ Gerenciamento Dinâmico:** Adicione, edite e exclua casos de teste em tempo real.
* **🎥 Evidências Multimídia:** Grave a tela ou tire capturas de tela diretamente da aplicação e anexe-as a um caso de teste.
* **📊 Roadmap Visual:** Obtenha uma visão geral do progresso com gráficos de pizza para resultados e tipos de falha.
* **💾 Salvar e Importar:** Exporte seu plano de testes completo para um arquivo `.json` para backup ou para compartilhar internamente. Importe um histórico para continuar de onde parou.
* **📧 Exportação Rápida:** Gere um resumo textual de todos os testes, pronto para ser copiado e colado em um e-mail ou relatório.
* **🔍 Filtros e Logs:** Filtre rapidamente por testes reprovados e visualize logs do console para depuração direto na interface.
* **🚫 Zero Dependências de Backend:** Funciona 100% no navegador. Não requer instalação, banco de dados ou servidor.

## 🚀 Como Usar

A aplicação não requer instalação ou configuração complexa.

1.  **Clone o repositório:**
    ```bash
    git clone [https://gitlab.com/sua-empresa/controle-de-testes.git](https://gitlab.com/sua-empresa/controle-de-testes.git) # Exemplo para GitLab
    # ou
    git clone [https://github.com/sua-organizacao/controle-de-testes.git](https://github.com/sua-organizacao/controle-de-testes.git) # Exemplo para GitHub
    ```
2.  **Navegue até a pasta:**
    ```bash
    cd controle-de-testes
    ```
3.  **Abra o arquivo `Controle de Teste.html`** diretamente no seu navegador de preferência (Google Chrome, Firefox, etc.).

E pronto! Você já pode começar a usar.

**Nota:** A aplicação utiliza uma imagem `logo.png` no cabeçalho. Certifique-se de que este arquivo esteja na mesma pasta que o `Controle de Teste.html` ou remova a tag `<img>` do HTML caso não queira usar um logo.

## 🛠️ Tecnologias Utilizadas

* **HTML5:** Estrutura da página.
* **CSS3:** Estilização e responsividade básica.
* **JavaScript (ES6+):** Toda a lógica da aplicação, manipulação do DOM e interatividade.
* **Chart.js:** Biblioteca para a criação dos gráficos do roadmap.
* **Web APIs:** Utiliza APIs nativas do navegador como `MediaDevices.getDisplayMedia` (gravação de tela) e `FileReader` (importação de arquivos).

## 🌳 Estrutura do Projeto

```
/
├── Controle de Teste.html   # O arquivo principal da aplicação
├── style.css                # Folha de estilos
├── script.js                # Lógica da aplicação
├── logo.png                 # Logo da empresa (opcional)
└── README.md                # Esta documentação
```

## 🤝 Como Contribuir

Contribuições são bem-vindas e incentivadas para aprimorar esta ferramenta interna.

Consulte o arquivo [CONTRIBUTING.md](CONTRIBUTING.md) para saber mais sobre nossas diretrizes de contribuição interna.

## 🔒 Direitos Autorais

Todos os direitos reservados à [Nome da Sua Empresa]. Este software é de propriedade privada e destina-se apenas ao uso interno autorizado.