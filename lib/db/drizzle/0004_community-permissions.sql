-- System role/permission definitions only; never seed users or memberships.
INSERT INTO roles(key,name) VALUES
 ('organization_owner','Organization Owner'),
 ('organization_admin','Organization Admin'),
 ('organization_member','Organization Member')
ON CONFLICT(key) DO NOTHING;
--> statement-breakpoint
INSERT INTO permissions(key,name,description) VALUES
 ('community.organization.read','Read organization community','Read member-only organization content and organization-visible projects'),
 ('community.organization.manage','Manage organization community','Manage organization settings, teams, repositories and project details'),
 ('community.organization.members','Manage organization membership','Grant roles, remove members and delete the organization')
ON CONFLICT(key) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE
 (p.key='community.organization.read' AND r.key IN('organization_owner','organization_admin','organization_member'))
 OR (p.key='community.organization.manage' AND r.key IN('organization_owner','organization_admin'))
 OR (p.key='community.organization.members' AND r.key='organization_owner')
ON CONFLICT DO NOTHING;
-- Custom SQL migration file, put your code below! --