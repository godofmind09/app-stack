# app-stack

A complete todo application stack deployed to Azure Kubernetes Service (AKS) via Helm and Azure Pipelines.

## Architecture

```
Browser → Ingress → frontend (nginx)
                 → /api/* → api (Node/Express) → PostgreSQL
                                               → Redis (BullMQ queue)
                                                    ↓
                                               worker (Node) → PostgreSQL
```

## Repo Structure

```
app-stack/
  frontend/         Static HTML/JS served by nginx
  api/              Node.js Express REST API
  worker/           Node.js BullMQ background worker
  charts/app-stack/ Helm chart (infra + app + ingress)
  azure-pipelines.yml  CI/CD pipeline
```

## Running the Pipeline

1. Push this repo to your Azure DevOps repository.
2. In Azure DevOps → Pipelines → New Pipeline → select your repo → use existing `azure-pipelines.yml`.
3. Ensure service connections `sc-acr` and `sc-azure-rm` exist in Project Settings → Service Connections.
4. Run the pipeline. It will:
   - Build and push 3 Docker images to ACR tagged with `$(Build.BuildId)` and `latest`.
   - Deploy the Helm chart to AKS namespace `todo-app`.

## Verifying Deployment

```bash
# Get all resources in the namespace
kubectl get all -n todo-app

# Check ingress and get external IP
kubectl get ingress -n todo-app

# Follow API logs
kubectl logs -f deployment/api -n todo-app

# Follow worker logs
kubectl logs -f deployment/worker -n todo-app
```

## Accessing the App

```bash
# Get ingress external IP
kubectl get ingress app-ingress -n todo-app -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Open `http://<EXTERNAL-IP>` in your browser.

- Frontend: `http://<EXTERNAL-IP>/`
- API health: `http://<EXTERNAL-IP>/api/health` (note: proxied as `/api/health` via ingress → `/health` on the service)
- API todos: `http://<EXTERNAL-IP>/api/todos`

## Validation Checklist

- [ ] ACR service connection `sc-acr` created in Azure DevOps
- [ ] Azure RM service connection `sc-azure-rm` created in Azure DevOps
- [ ] `YOUR_ACR_NAME`, `YOUR_RESOURCE_GROUP`, `YOUR_AKS_NAME` replaced in `azure-pipelines.yml`
- [ ] PostgreSQL password updated in `charts/app-stack/values.yaml`
- [ ] Pipeline runs successfully (Build + Deploy stages green)
- [ ] `kubectl get pods -n todo-app` shows all pods Running
- [ ] Ingress has an external IP assigned
- [ ] Browser opens frontend and shows todo list
- [ ] Creating a todo returns 201 and appears in the list
- [ ] After ~2 seconds, todo status changes from Pending to Processed (auto-refresh every 5s)
