# Fixtures de desenvolvimento

Estes adapters ficam fora do carregamento normal do shell. A fixture `class-echo-module.js` exercita o caminho request/response do Core quando `AETHERIUS_UI_DEMO=1` estiver configurado no servidor e a página principal for aberta com `?fixtures`. A fixture `shop-slot-module.js` registra temporariamente o slot `shop` com um painel vazio.

Ambas retornam um disposer ao registro e suportam o lifecycle `unmount`. Não são módulos finais. A fixture `shop` não implementa preço, serviço, compra, checkout, apoiadores, saldo ou persistência.

Para incluir os scripts no pacote de teste, configure CMake com `-DAETHERIUS_UI_INCLUDE_FIXTURES=ON`. O padrão é não copiá-los para a distribuição.
