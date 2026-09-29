#!/bin/sh
# Regenerates the certificate fixtures used by chain_validator.test.mjs.
# All certificates are valid for 20 years so the suite stays deterministic.
set -e
cd "$(dirname "$0")"

cat > ext.cnf <<'EOF'
[root]
basicConstraints = critical, CA:TRUE, pathlen:2
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always

[intermediate]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always

[leaf]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always

[leaf_keycertsign]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyCertSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always

[leaf_nokeyusage]
basicConstraints = critical, CA:FALSE
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always

[leaf_ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, digitalSignature, keyCertSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF

DAYS=7300

issue() { # name subject signer extensions
  openssl ecparam -name prime256v1 -genkey -noout -out "$1.key"
  openssl req -new -key "$1.key" -subj "$2" -out "$1.csr"
  openssl x509 -req -in "$1.csr" -CA "$3.crt" -CAkey "$3.key" -CAcreateserial \
    -sha256 -days $DAYS -extfile ext.cnf -extensions "$4" -out "$1.crt"
}

openssl ecparam -name prime256v1 -genkey -noout -out root.key
openssl req -new -x509 -key root.key -sha256 -days $DAYS \
  -subj "/C=US/O=Fixture/CN=Fixture Root CA" -config ext.cnf -extensions root -out root.crt

issue int "/C=US/O=Fixture/CN=Fixture Issuing CA" root intermediate
issue leaf "/C=US/O=Fixture/CN=Fixture Leaf" int leaf
issue leaf_ca "/C=US/O=Fixture/CN=Fixture Leaf With CA True" int leaf_ca
issue leaf_keycertsign "/C=US/O=Fixture/CN=Fixture CA False With keyCertSign" int leaf_keycertsign
issue leaf_nokeyusage "/C=US/O=Fixture/CN=Fixture CA False Without keyUsage" int leaf_nokeyusage
issue child_of_keycertsign "/C=US/O=Fixture/CN=Signed By CA False Leaf" leaf_keycertsign leaf
issue child_of_nokeyusage "/C=US/O=Fixture/CN=Signed By CA False Leaf 2" leaf_nokeyusage leaf

rm -f ./*.csr ./*.srl ./*.key ext.cnf
