Feature: Workspace management

  Background:
    Given a seeded user exists
    And the user has an active workspace session

  Scenario: Create a new tenant
    When I POST "/tenants" with body:
      """
      { "name": "Acme Corp", "slug": "acme-corp" }
      """
    Then the response status is 201
    And the response body has field "tenant.slug" equal to "acme-corp"
    And the response body has field "membership.role" equal to "owner"

  Scenario: Create tenant with duplicate slug returns 409
    Given a tenant with slug "taken-slug" already exists
    When I POST "/tenants" with body:
      """
      { "name": "Another Corp", "slug": "taken-slug" }
      """
    Then the response status is 409

  Scenario: Get current tenant info
    When I GET "/tenants/me"
    Then the response status is 200
    And the response body has field "tenant.id"
    And the response body has field "membership.role"

  Scenario: List tenant members
    When I GET "/tenants/me/members"
    Then the response status is 200
    And the response body has field "members"

  Scenario: Access tenant route without tenant context returns 400
    Given the user has an active session without workspace
    When I GET "/tenants/me" with that session
    Then the response status is 400
