/**
 * Static Test RSA Key Pair for Scenario Testing
 *
 * This file provides a fixed RSA key pair used by:
 * 1. The scenario runner (signs JWTs with private key)
 * 2. The backend in scenario mode (validates JWTs with public key)
 *
 * The key pair is intentionally static (not generated at runtime) so that
 * both processes can use the same keys without coordination.
 *
 * SECURITY:
 * - These are TEST KEYS ONLY — they have no security value
 * - Backend MUST refuse to use these keys in production (NODE_ENV === production)
 * - Backend MUST require SCENARIO_TESTING === 'true' to enable
 * - Keys are committed to git intentionally for reproducible testing
 *
 * Generated with: node -e "crypto.generateKeyPairSync('rsa', {...})"
 */

// RSA 2048-bit test private key (PKCS#8 PEM format)
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCkUYwmw+6BWehW
ZFQDJbr6dvVrMW+oK4+wm8+XS880qN79vM9/dmVB3L6nrnthswpYvAD7kyHfNc4y
oaJ2gE6A4vQyUcQgbcbKeOyXN0drghz/z+gLgDOZX0eoh5KOGj2aLDJ50Jfb1G9B
g2TzeQDZXtgZww15AJ/yQC/GFoJm9/aGs13pj7pqrQpdIJIWskPxYFKYzKs1oo6I
Yrrikwpm4vph/5xf7mQha2bMGq+xiOclNC8klkVOy1w7C7iI5cXcix05LSYyaPJ8
fhl2lbmCa3BXugvm5qCilhA/f88rEllLJOY7/H3Tlqb/9yjgMHm8Kf8FmNLmERl9
jTE8S0JNAgMBAAECggEASxvdYNDZofW7TlYQ0tl5xMgAeU2BGNFEnnkyJBmqboss
VrZp8HzpXvgsi9AlJKzms1XIazY/Wtyo0prwfJM8jwxui9u1Nw+GuQEaQCqr8jfo
0oOxsSQaMeaMBjxmIJ9c/i5qqiTPbVQGwN7zE5mBalrAk9IFRASll+GAFN8wHylI
VhpZvVY1exI+GzNWS/dDi05rkaCb1aI44eZwgiE7Y5fGdQPxkiEcJkwzSSIWvChp
5WYPZvaMzmQH5X9NCbFIfe1D82GnT615Y8CtUBZiCQGB9gsXzmcwKUMB9MdBUCj2
FLfxhcnEm6DQJwpQblvC3gnXz6FR17ssu4lNZhmIbwKBgQDQy/nxaqfGYoUfdtTv
o3wIFaN0vdEofTniE0nae1BMDH6lXKUMZfJqYuONREAxnvAODaWKR/0o+2JKkZZ5
clhwZCKK8jWBA9sFwERsQx0DDffb0cncaphmS66ZxORb8Ztjl/JPN9jCSY1+b7Dn
1vDrs2VJwQG5B7okyoQBauN/uwKBgQDJd2mNc2Hx7V4Q6D12JXvTaoqY82itpdEy
P4wCd02iiuMzlmn8mKfNVCImjxnw+woc0qC1A0+FZ5Eg/zvomeSSQjE0ZrN2JuLt
sdiP+PCwemUJHuFuvbXYIM7q6XgXZJElZXuK7jeh1r0U/r/jzhjuNIz1AaaEjHM6
zWqOrSaRlwKBgEIudWINQXLDZZjMjMAMnNLfMPle9T4VO1Sqcn1bGt+QElCN5g7g
/Y61G5V6bbKMw2Bg+Pi0yszDqasjLIQAN4Iga0aJcWYcd78B6245c6e1NLwragWA
kB/Um1pIK23tTiiqT/bGJ+GleMD73CIQYjsDmPZgxBAHH/xraJ4eaE/jAoGAVYMK
2VA1LYOr3o9EryYf1c+t/leqgbIVBjf0zIMo/6nl39qjJ+T/rGZejHFG+IMFetBo
CAzcruoTrqbHHeZcHzxbODuzRp4gyfUnz4xBVRbOVb22v9NkINVkHk90erFj7jSR
6JlOIbJM1WF/v0iWSl0hy0ilDjOzIS1ZYi/aZAcCgYBec6EkBDD9rtYipwxTrgf2
oXIFKJq4WRxxoN57GNu/WUj5YV8/EubTBtfvORObZtHhGvhEHImlBBghXOFeN2kA
U7JAVNB4POGKl5ELRRch8EAVf0yxDWHBa9o5y3LuHALNM9fTZvVg1eQ/QKFy1AZj
PODUiAa/6dhX03zN0OizbA==
-----END PRIVATE KEY-----`;

// RSA 2048-bit test public key (SPKI PEM format)
const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApFGMJsPugVnoVmRUAyW6
+nb1azFvqCuPsJvPl0vPNKje/bzPf3ZlQdy+p657YbMKWLwA+5Mh3zXOMqGidoBO
gOL0MlHEIG3GynjslzdHa4Ic/8/oC4AzmV9HqIeSjho9miwyedCX29RvQYNk83kA
2V7YGcMNeQCf8kAvxhaCZvf2hrNd6Y+6aq0KXSCSFrJD8WBSmMyrNaKOiGK64pMK
ZuL6Yf+cX+5kIWtmzBqvsYjnJTQvJJZFTstcOwu4iOXF3IsdOS0mMmjyfH4ZdpW5
gmtwV7oL5uagopYQP3/PKxJZSyTmO/x905am//co4DB5vCn/BZjS5hEZfY0xPEtC
TQIDAQAB
-----END PUBLIC KEY-----`;

// Test JWT configuration
const TEST_ISSUER = 'scenario-test-issuer';
const TEST_AUDIENCE = 'scenario-test-audience';

module.exports = {
  TEST_PRIVATE_KEY,
  TEST_PUBLIC_KEY,
  TEST_ISSUER,
  TEST_AUDIENCE,
};
