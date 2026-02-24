Feature: API key management

  Background:
    Given a seeded user exists
    And the user has an active workspace session

  Scenario: Create an API key
    When I POST "/api-keys" with body:
      """
      { "name": "My CI key", "scopes": ["read"] }
      """
    Then the response status is 201
    And the response body has field "fullKey"
    And the response body has field "apiKey.id"
    And the response body has field "apiKey.prefix"

  Scenario: List API keys
    When I GET "/api-keys"
    Then the response status is 200
    And the response body has field "apiKeys"

  Scenario: Revoke an API key
    Given an API key exists for the current tenant
    When I DELETE "/api-keys/:id" using the stored key id
    Then the response status is 204

  Scenario: Revoke a non-existent key returns 404
    When I DELETE "/api-keys/00000000-0000-0000-0000-000000000000"
    Then the response status is 404
