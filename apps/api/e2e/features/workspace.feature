Feature: Workspace management

  Background:
    Given a seeded user exists
    And the user has an active workspace session

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
