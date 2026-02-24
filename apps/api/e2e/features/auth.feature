Feature: Authentication

  Background:
    Given a seeded user exists

  Scenario: Refresh token issues a new access token
    Given the user has an active session
    When I POST "/auth/refresh" with the refresh cookie
    Then the response status is 200
    And the response body has field "accessToken"

  Scenario: Refresh with no cookie returns 401
    When I POST "/auth/refresh" with no cookie
    Then the response status is 401

  Scenario: Logout invalidates the session
    Given the user has an active session
    When I DELETE "/auth/logout" with the refresh cookie
    Then the response status is 204
    And a subsequent POST "/auth/refresh" with the same cookie returns 401

  Scenario: Access a protected route without a token returns 401
    When I GET "/tenants/me" without authentication
    Then the response status is 401
