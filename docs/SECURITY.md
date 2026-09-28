# Segurança e consistência

- Browser e client são não confiáveis. Toda ação é uma intenção; somente o servidor decide resultados persistentes.
- O router usa o `userId` emitido pelo evento SkyMP para buscar sessão e ator. Não lê identidade do envelope nem aceita uma sessão transferida entre usuários.
- Envelope Aetherius UI é limitado a 16 KiB; o wrapper de request é limitado a 18 KiB. O parser comum do `CustomPacket` aceita até 256 KiB para preservar os outros tipos já usados pelo SkyMP, enquanto o UI System aplica seu limite menor antes de validar e despachar. Requests são deduplicados por sessão. Reconnect invalida a revisão conhecida e exige snapshot.
- Nenhum payload integral, credencial, IP, inventário ou movimento do mouse é registrado pelo Core.
- Assets de runtime ficam em `mod://aetheriusui/`; nenhuma navegação HTTP remota é usada no bridge.
- O router de demonstração registra apenas `core.echo`. Não há mutação de gameplay ou handler de domínio nesta entrega.
- Handlers futuros têm de implementar autorização/contexto no serviço autoritativo e produzir sua própria auditoria. Uma resposta do frontend não prova execução nem auditoria.
