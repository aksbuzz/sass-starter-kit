Feature: Admin tenant management

  Background:
    Given a platform admin user exists
    And the admin has an active session

  Scenario: Admin can create a new tenant
    When I POST "/admin/tenants" with body:
      """
      { "name": "Acme Corp", "slug": "acme-corp-e2e" }
      """
    Then the response status is 201
    And the response body has field "tenant.slug" equal to "acme-corp-e2e"

  Scenario: Admin create tenant with duplicate slug returns 409
    Given a tenant with slug "taken-admin-slug" already exists
    When I POST "/admin/tenants" with body:
      """
      { "name": "Another Corp", "slug": "taken-admin-slug" }
      """
    Then the response status is 409

  Scenario: Admin can list tenants
    When I GET "/admin/tenants"
    Then the response status is 200
    And the response body has field "tenants"

  Scenario: Non-admin cannot access admin routes
    Given a seeded user exists
    And the user has an active workspace session
    When I POST "/admin/tenants" with body:
      """
      { "name": "Hacker Corp" }
      """
    Then the response status is 403
