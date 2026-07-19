# Configuração de acesso administrativo do PBA Flow

A operação técnica usa a chave pública do Supabase e continua disponível sem senha. Gestor e DEV usam contas do Supabase Auth; nenhuma senha administrativa fica no HTML ou no repositório.

## 1. Aplicar as migrations

Aplique as migrations da pasta `supabase/migrations` no projeto `yyeawfmohlhizyhcxpji` pelo fluxo de deploy usado pela equipe ou pelo SQL Editor do Supabase.

## 2. Criar as contas

No Supabase Dashboard, abra **Authentication → Users → Add user** e crie os usuários com e-mail e senha. Para produção, mantenha o cadastro público desativado.

## 3. Definir Gestor ou DEV

No SQL Editor, atribua o papel no `app_metadata` da conta. Troque o e-mail e o papel conforme necessário:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'manager')
where email = 'gestor@empresa.com.br';
```

Papéis aceitos:

- `manager`: Gestor
- `developer`: DEV
- `technician`: Técnico autenticado

A trigger da migration sincroniza automaticamente o papel para `public.profiles`. Para forçar a atualização de uma conta antiga, execute:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data
where email = 'gestor@empresa.com.br';
```

## 4. Conferir a pausa automática

A migration agenda `public.pause_due_repairs()` a cada minuto pelo `pg_cron`. A função só pausa reparos ativos a partir de 18:05 no fuso `America/Sao_Paulo`. Uma trigger no banco também impede que um navegador com dados atrasados reative o cronômetro depois desse horário.

Para conferir o agendamento:

```sql
select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'pba-flow-repair-autopause';
```

## 5. Segurança

As regras RLS permitem leitura operacional para os postos sem login, mas alterações em técnicos, motivos de espera, prioridades de O.P. e limites de tempo exigem perfil `manager` ou `developer`. A chave pública incluída no frontend não substitui essas regras e não concede acesso administrativo.
