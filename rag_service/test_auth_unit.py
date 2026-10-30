import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from rag_service.auth import (
    _decode_access_token,
    create_access_token,
    hash_password,
    verify_password,
)


class AuthenticationUnitTests(unittest.TestCase):
    def test_password_hash_verifies_only_matching_password(self):
        encoded = hash_password("correct horse battery staple")

        self.assertTrue(verify_password("correct horse battery staple", encoded))
        self.assertFalse(verify_password("incorrect password", encoded))

    def test_access_token_round_trip_and_tamper_rejection(self):
        with patch.dict(os.environ, {"AEIP_SECRET_KEY": "unit-test-signing-key"}):
            token = create_access_token("USER-1")
            self.assertEqual(_decode_access_token(token)["sub"], "USER-1")

            with self.assertRaises(HTTPException) as error:
                _decode_access_token(token + "tampered")
            self.assertEqual(error.exception.status_code, 401)

    def test_expired_access_token_is_rejected(self):
        with patch.dict(os.environ, {"AEIP_SECRET_KEY": "unit-test-signing-key"}):
            token = create_access_token("USER-1", expires_in=0)

            with self.assertRaises(HTTPException) as error:
                _decode_access_token(token)
            self.assertEqual(error.exception.status_code, 401)

    def test_token_creation_requires_a_configured_secret(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as error:
                create_access_token("USER-1")
            self.assertEqual(error.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
