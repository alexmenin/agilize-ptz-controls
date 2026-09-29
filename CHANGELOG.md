# Histórico de versões

## 1.7.0

- Cores e logotipos: editor de moldura com até 8 PNGs, arraste e coordenadas, sem invadir a área do GC.
- Moldura em mídia própria e incorporada a cada GC; retirar nome conserva a moldura.
- Criação/edição de nomes, cores e moldura envia as artes automaticamente ao ATEM.
- Atualização de GC no ar retira o chaveador durante o envio e restaura a composição ao concluir.
- Espaços ocupados indisponíveis na seleção; exclusão libera a mídia vinculada sem apagar artes externas.
- Inclui a correção dos presets VDL99009 e proteção de gravação da versão 1.6.1.
- 145 testes automatizados; interface desktop/mobile simulada. Hardware e Windows nativo ainda exigem validação.

## 1.6.1

- Corrige a importação de presets da VDL99009 com tokens no formato `Preset N`, incluindo a memória zero.
- Preserva os IDs, nomes e vínculos dos presets já cadastrados.
- Exige memória escolhida e confirmação explícita antes de gravar uma nova posição física.
- Bloqueia gravações sem confirmação na camada de comandos e no endpoint legado.
- Remove a alocação automática de memórias baseada em uma lista local possivelmente incompleta.
- Inclui documentação ilustrada de instalação, câmeras, celular, ATEM e GCs.
- Validação: 139 testes automatizados, tipos, lint e simulação de cadastro/edição, sincronização e recarga da interface.

A importação não deve enviar comandos de gravação. Esta versão não restaura posições físicas já sobrescritas. Equipamentos reais e abertura nativa no Windows precisam de validação no local.

## 1.6.0

- Splash screen, faixa de GCs, vínculo de GC ao preset e retirada do GC quando não vinculado.
- Cores, brasão e logo PNG na arte dos GCs.
- Associação HDMI, corte direto e GC após atraso de 1 segundo do acionamento PTZ.
- Formulário compartilhado de cadastro/edição de câmera, com rodapé fixo e rolagem.

## Versões anteriores

Controle VISCA, leitura ONVIF, importação do PTZ Controls/OBS, multiview RTSP, miniaturas JPG e operação pelo celular na rede local.
