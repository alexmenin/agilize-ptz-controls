# Contribuir

Leia o [guia de desenvolvimento](docs/architecture/development-agilize.md) e o [código de conduta](CODE_OF_CONDUCT.md).

Descreva o problema, comportamento esperado e como reproduzi-lo. Não inclua credenciais, exportações privadas ou imagens de transmissões sem autorização. Falhas de segurança devem seguir [SECURITY.md](SECURITY.md).

Antes de propor uma alteração, execute `npm run type`, `npm test`, `npm run lint` e `npm run format:check`. Para protocolos, cubra os comandos efetivamente enviados e os cenários de cancelamento/falha. Importar presets nunca deve criar ou substituir posições físicas.

Use equipamentos simulados durante o desenvolvimento. Validação em hardware deve ser descrita separadamente, com modelo e firmware, sem publicar números de série ou endereços privados da instalação.
