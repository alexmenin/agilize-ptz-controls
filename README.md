# Agilize PTZ Controls

**Câmeras, enquadramentos e nomes na tela em uma única mesa de operação.**

Desenvolvido pela **[Agilize Soluções Digitais](https://agilizesolucoesdigitais.com.br)**, a partir do projeto aberto Panevo.

## Baixar a versão 1.7.0

[**Abrir downloads, notas e fotos da versão 1.7.0**](https://github.com/alexmenin/agilize-ptz-controls/releases/tag/v1.7.0)

- **Agilize-PTZ-Controls-Setup-1.7.0.exe:** instalador para Windows x64, recomendado para uso diário.
- **Agilize-PTZ-Controls-1.7.0.exe:** versão portátil.
- **Agilize-PTZ-Controls-Source-1.7.0.zip:** código completo e guias ilustrados.
- **SHA256SUMS.txt:** verificação de integridade.

> A importação das pastas para a branch main ainda está pendente. Para consultar todo o código ou compilar, baixe o arquivo **Agilize-PTZ-Controls-Source-1.7.0.zip** nos Assets da Release; os arquivos automáticos “Source code” do GitHub ainda não contêm o projeto completo.

![Mesa de operação](https://github.com/user-attachments/assets/a01d44f1-017b-4ec8-8aec-d2d60acf9ef7)

As capturas usam equipamentos e nomes fictícios. Vídeo indisponível é uma condição da demonstração.

## O que o sistema faz

- Controle PTZ por joystick, zoom, foco, velocidade e parada, com preferência por VISCA.
- Presets de várias câmeras com busca, rolagem, setas e acionamento com um clique ou Enter/Espaço. Passar o mouse ou navegar não movimenta a câmera.
- JPG de referência do último acionamento e multiview RTSP.
- Interface responsiva no celular pela mesma rede, com o computador e o Agilize ligados.
- Integração ATEM Mini: Program/Preview, associação de câmera à HDMI e corte após espera de 1 segundo.
- GCs de vereadores, cores e moldura com até 8 PNGs fora da área do nome. Salvar atualiza automaticamente as artes no ATEM.
- Preset sem GC retira o nome e mantém a moldura.

A lista de memórias ocupadas não é uma consulta VISCA universal. A descoberta depende dos recursos da câmera ou da configuração importada. **Importar presets não grava posições na câmera.**

## Instalação e primeira configuração

1. Baixe e execute o instalador nos Assets da Release. Não é necessário instalar Node.js ou Python.
2. Abra o Agilize e acesse **Câmeras**. Cadastre nome, endereço IP e configuração VISCA conforme o equipamento. Informe ONVIF e RTSP quando utilizados.
3. Conecte e importe os presets existentes. Confira os nomes e teste um enquadramento em ambiente de preparação antes da transmissão.
4. No celular, conectado à mesma rede, abra o endereço exibido pelo aplicativo. O computador deve permanecer ligado.
5. Para usar os GCs, adicione o ATEM pelo IP da rede e associe cada câmera à entrada HDMI correspondente.
6. Cadastre os vereadores e vincule os GCs aos presets desejados. Em **Cores e logotipos**, ajuste as cores e posicione os PNGs da moldura. Salvar envia as artes automaticamente ao ATEM conectado.

![Cadastro e edição de câmera](https://github.com/user-attachments/assets/b4cd167c-4a28-449e-ab31-b3d8c02d9b65)

![Cores e logotipos](https://github.com/user-attachments/assets/1a2e1ad7-f5e7-4f57-afe4-bc2d005b6522)

## GCs e moldura

Ao atualizar uma arte que está no ar, a integração retira temporariamente o chaveador durante o envio e restaura a composição ao concluir. A moldura também pode desaparecer durante essa transferência porque utiliza o mesmo chaveador.

A moldura reserva um espaço próprio de mídia. Os espaços dos GCs ficam reservados até sua exclusão. O seletor oferece somente espaços disponíveis; artes externas são preservadas.

## Guias completos e validação

O ZIP de código completo inclui os guias ilustrados em **docs/instalacao-configuracao.md**, **docs/atem-gc.md** e **docs/manual.md**, além das instruções de compilação em **docs/architecture/development-agilize.md**.

A versão passou por 145 testes automatizados, checagem de tipos, lint e conferência visual desktop/mobile. A operação em câmeras/ATEM físicos e a execução nativa no Windows ainda precisam de validação no equipamento real. Os executáveis não possuem assinatura digital.

Consulte [as mudanças](CHANGELOG.md), [segurança](SECURITY.md), [licença MIT](LICENSE) e [créditos de terceiros](THIRD_PARTY_NOTICES.md).
