Feature: Health check

  Scenario: API is running and database is reachable
    When I GET "/health"
    Then the response status is 200
    And the response body has field "status" equal to "ok"
    And the response body has field "timestamp"
