# Agilize PTZ Controls

**Câmeras, enquadramentos e nomes na tela em uma única mesa de operação.**

Desenvolvido pela **[Agilize Soluções Digitais](https://agilizesolucoesdigitais.com.br)**, a partir do projeto aberto Panevo.

O Agilize ajuda operadores de câmaras municipais, eventos e transmissões a posicionar câmeras PTZ e preparar os enquadramentos. Com um ATEM Mini compatível conectado, também associa cada câmera à entrada HDMI e coloca os GCs dos vereadores no ar. A transmissão pode continuar diretamente no ATEM Mini Pro, sem OBS.

![Mesa de operação com presets e GCs](docs/images/mesa-operacao.png)

> As capturas deste guia usam equipamentos e nomes fictícios. Vídeo indisponível nas capturas é uma condição da demonstração, não uma transmissão real.

## Baixar e instalar

Abra a seção **Releases** deste repositório e procure a versão **1.7.0**:

| Arquivo                                 | Uso                                                              |
| --------------------------------------- | ---------------------------------------------------------------- |
| `Agilize-PTZ-Controls-Setup-1.7.0.exe`  | Instalação no Windows, com atalhos. Recomendado para uso diário. |
| `Agilize-PTZ-Controls-1.7.0.exe`        | Portátil: execute e aguarde a extração automática.               |
| `Agilize-PTZ-Controls-Source-1.7.0.zip` | Código-fonte e documentação para desenvolvedores.                |
| `SHA256SUMS.txt`                        | Resumos para verificar a integridade dos arquivos.               |

Não é necessário instalar Node.js ou Python para usar os executáveis. Consulte o **[tutorial de instalação e configuração](docs/instalacao-configuracao.md)** antes da primeira operação.

## O que o sistema faz

- **Controle PTZ:** joystick, zoom, foco, velocidade e parada; VISCA como preferência de operação.
- **Presets de várias câmeras:** busca, rolagem, navegação pelas setas e acionamento com um clique ou Enter/Espaço. Passar o mouse e navegar não movimentam a câmera.
- **Referência visual:** JPG do último acionamento de cada preset, capturado do RTSP após o tempo configurado.
- **Multiview:** prévias RTSP das câmeras cadastradas.
- **Celular:** interface responsiva pelo navegador na mesma rede, com o computador ligado e o Agilize aberto.
- **ATEM Mini:** identificação de Program/Preview e corte para a HDMI associada ao preset, após espera de 1 segundo.
- **GCs e moldura:** nome, partido, cargo e cores; até 8 PNGs posicionáveis fora da área do GC. Salvar envia automaticamente as artes ao ATEM. Preset sem GC retira o nome e mantém a moldura.
- **Importação de presets:** leitura ONVIF quando compatível e importação de configurações do PTZ Controls/OBS, mantendo os comandos VISCA.

A lista de memórias ocupadas não é uma consulta VISCA universal. A leitura depende do que o equipamento oferece e da configuração importada. Descobrir ou importar presets **não grava posições na câmera**.

## Guias ilustrados

- [Instalar, cadastrar câmeras e acessar pelo celular](docs/instalacao-configuracao.md)
- [Conectar o ATEM, mapear HDMI e preparar os GCs](docs/atem-gc.md)
- [Manual completo e detalhes de operação](docs/manual.md)
- [O que mudou na versão 1.7.0](CHANGELOG.md)
- [Compilar e testar o projeto](docs/architecture/development-agilize.md)
- [Segurança e dados locais](SECURITY.md)

## Novidades da versão 1.7.0

O editor **Cores e logotipos** permite montar uma moldura permanente. Salvar um GC ou sua aparência atualiza as artes no ATEM automaticamente, inclusive quando havia um GC no ar: a integração retira o chaveador durante o envio e restaura o nome anterior ao concluir. Retirar o GC mantém somente a moldura. Ela reserva um espaço de mídia próprio, além dos espaços dos nomes.

O seletor oferece apenas espaços disponíveis. O espaço de um GC permanece reservado até sua exclusão, que apaga a arte vinculada do ATEM e libera a memória. Artes externas permanecem protegidas.

### Correção de importação dos presets

Corrige a importação dos tokens `Preset 0` a `Preset 6` enviados pelo modelo VDL99009. A atualização conserva IDs, nomes e vínculos locais existentes. Depois de atualizar, clique em **Atualizar presets**.

**Salvar posição atual** exige escolher uma memória e confirmar a gravação. A aplicação não escolhe automaticamente um slot supostamente livre. Uma memória que não aparece no Agilize ainda pode estar ocupada na câmera. Esta correção não recupera posições físicas já sobrescritas.

## Compatibilidade e validação

Distribuição Windows x64. Câmeras, computador, celular e ATEM precisam de conectividade na rede local. RTSP e ONVIF dependem das capacidades e credenciais de cada câmera; portas variam conforme o fabricante.

A integração de GC usa o Media Player 1 e o primeiro chaveador do ATEM, compartilhado com funções como PiP/chroma. As artes são estáticas, transparentes e em 1920 × 1080; use o ATEM em 1080 HD. A espera de 1 segundo não confirma que a PTZ terminou seu movimento.

A versão 1.7.0 passou por **145 testes automatizados**, verificações de tipos e código e simulações de interface. Os executáveis foram gerados em Linux: abertura nativa no Windows, movimento das câmeras e saída física do ATEM ainda exigem validação no equipamento. Os executáveis não possuem assinatura digital de editor.

## Desenvolvimento, licença e créditos

**Agilize Soluções Digitais** · [agilizesolucoesdigitais.com.br](https://agilizesolucoesdigitais.com.br)

Derivado de [Panevo](https://github.com/dutchdronesquad/panevo), de Dutch Drone Squad / Klaas Schoute, sob licença MIT. Base: v0.1.2, commit `cd521330b9f87e1d3d8ce1420fa23195e65adb28`. A atribuição original está preservada em [LICENSE](LICENSE). Consulte também os [créditos de componentes](THIRD_PARTY_NOTICES.md).

Este projeto é independente; não é um produto oficial da Blackmagic Design.
