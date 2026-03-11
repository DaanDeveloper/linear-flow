export interface LinearWebhookPayload {
  action: string;
  type: string;
  data: LinearIssueData;
  createdAt: string;
  organizationId: string;
}

export interface LinearIssueData {
  id: string;
  identifier: string;
  title: string;
  number: number;
  teamId: string;
  description?: string;
  projectId?: string;
  state: {
    name: string;
  };
}
