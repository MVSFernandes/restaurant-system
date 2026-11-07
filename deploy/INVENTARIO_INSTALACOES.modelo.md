# Inventário das instalações (modelo)

Copie para um local **privado, fora do repositório** e mantenha uma seção por
instalação. Roteiro: `RELEASES.md`.

**Nunca registre valores de credenciais:** chaves `service_role`, `anon` ou
`sb_*`, `JWT_*`, tokens e segredos da Focus NFe, senhas, conteúdo de arquivos de
ambiente. Registre só o **nome** do segredo e onde ele está no cofre.

Um campo com "a confirmar" impede atualizar a instalação. Não preencha por
dedução.

## Índice

| Cliente | Ambiente | `installation_id` | Ref | Situação |
| --- | --- | --- | --- | --- |
| Mesa Farta | Produção | a confirmar | a confirmar | A confirmar: instalação, ref, host e forma de publicação sem registro. Nenhuma atualização |

---

## `<installation_id>`

### Identidade

Estes são os valores esperados na confirmação de destino (`RELEASES.md`, seção 3).

| Campo | Valor |
| --- | --- |
| Cliente | |
| Ambiente (`development`, `staging`, `production`) | |
| `installation_id` | |
| Projeto Supabase: nome | |
| Projeto Supabase: ref | |
| Organização Supabase e plano | |
| Domínio ou URL pública | |
| Onde roda (máquina, serviço) | |
| Dados | Sintéticos / reais |
| Teste com escrita de negócio (caixa, pedido, cancelamento, estoque, Realtime) | Proibido / permitido. Padrão: proibido |
| Emissão fiscal | Desligada / homologação / produção |
| Responsável pela operação | |
| Quem aprova atualizações | |

### Estado atual

| Campo | Valor |
| --- | --- |
| Versão da aplicação | |
| Imagem do backend (ID ou digest) | |
| Imagem do frontend (ID ou digest) | |
| Última migration aplicada | |
| Tag dos checkouts de conferência | Esta tag ou mais nova. Banco à frente da aplicação: é a tag **da migration** |
| Versão anterior e imagens, para voltar | |
| Última conferência (data e veredito) | |

### Arquivos e segredos

| Campo | Valor |
| --- | --- |
| Pasta privada (`backend.env`, `frontend.env`, `release.env`) | |
| Segredos no cofre: nomes | `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FOCUS_NFE_TOKEN`, `FOCUS_NFE_WEBHOOK_SECRET` |
| Local no cofre | |
| Data da última rotação | |

### Backup

| Campo | Valor |
| --- | --- |
| Política | |
| Último backup conferido | |
| Último teste de restauração | |

### Histórico de atualizações

| Data e hora | De → para | Migrations | Backup | Janela | Resultado | Quem | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | Concluída / interrompida / aplicação voltou | | |
