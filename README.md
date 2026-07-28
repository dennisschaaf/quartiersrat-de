# quartiersrat.de

AWS CDK Projekt für das Quartiersräte-Portal `quartiersrat.de`. Basiert auf der gleichen Struktur wie [paulina-food](../paulina-food).

## Überblick

- **`quartiersrat.de`** — Portal-Seite, auf der aktive Quartiersräte verlinkt sind
- **`harthof.quartiersrat.de`** — Landing Page des Quartiersrats Harthof / Am Hart (gegründet April 2026, begleitet durch EU-Projekt ASCEND)

Jeder Quartiersrat bekommt eine eigene Subdomain und S3/CloudFront-Deploymenteinheit. Das Wildcard-Zertifikat (`*.quartiersrat.de`) deckt alle aktuellen und zukünftigen Subdomains ab.

## Voraussetzungen

- [Bun](https://bun.sh) installiert
- AWS CLI konfiguriert mit Profil `quartiersrat` (`aws configure --profile quartiersrat`)
- CDK Bootstrap im Account `806941787553` für `eu-central-1` und `us-east-1`:
  ```bash
  bunx cdk bootstrap aws://806941787553/eu-central-1 --profile quartiersrat
  bunx cdk bootstrap aws://806941787553/us-east-1 --profile quartiersrat
  ```

## Installation

```bash
bun install
```

## Entwicklung

```bash
bun run dev
```

Startet einen lokalen Dev-Server mit Auto-Reload:

| Seite | URL |
|-------|-----|
| quartiersrat.de | http://localhost:3000/root/ |
| harthof.quartiersrat.de | http://localhost:3000/harthof/ |

## Deployment

### Erster Deploy

```bash
bun run deploy
```

Nach dem ersten Deploy gibt der Stack `QuartiersratZone` die **Nameserver** aus:

```
QuartiersratZone.NameServers = ns-123.awsdns-12.com, ns-456.awsdns-34.net, ...
```

Diese vier Nameserver müssen beim Domain-Registrar für `quartiersrat.de` eingetragen werden. Anschließend validiert sich das ACM-Zertifikat automatisch per DNS (kann einige Minuten dauern).

### Folge-Deploys

```bash
bun run deploy   # alle drei Stacks
bun run diff     # Vorschau der Änderungen
bun run synth    # CloudFormation-Templates generieren
```

## Architektur

Drei CDK-Stacks werden zusammen deployed:

```
QuartiersratZone  (eu-central-1)
  └─ Route53 Hosted Zone für quartiersrat.de

QuartiersratCerts  (us-east-1)
  └─ ACM Wildcard-Zertifikat (quartiersrat.de + *.quartiersrat.de)
      Pflichtregion us-east-1 für CloudFront

QuartiersratStack  (eu-central-1)
  ├─ S3 Bucket + CloudFront → quartiersrat.de / www.quartiersrat.de
  └─ S3 Bucket + CloudFront → harthof.quartiersrat.de
```

## Projektstruktur

```
quartiersrat/
├── bin/
│   └── app.ts                        # CDK App-Einstiegspunkt
├── lib/
│   ├── quartiersrat-zone-stack.ts    # Hosted Zone Stack
│   ├── quartiersrat-cert-stack.ts    # Zertifikat Stack (us-east-1)
│   └── quartiersrat-stack.ts         # Haupt-Stack mit S3 + CloudFront
├── static/
│   ├── root/
│   │   └── index.html               # quartiersrat.de Portal-Seite
│   └── harthof/
│       ├── index.html               # Harthof Landing Page
│       └── styles.css               # Design System
└── scripts/
    └── dev.ts                        # Lokaler Dev-Server
```

## Neuen Quartiersrat hinzufügen

1. Neues Verzeichnis `static/<name>/` mit `index.html` und `styles.css` anlegen
2. In `lib/quartiersrat-stack.ts` ergänzen:
   - Neuer S3 Bucket
   - Neue CloudFront Distribution mit `<name>.quartiersrat.de`
   - Neuer DNS A-Record
   - Neues `BucketDeployment`
3. In `static/root/index.html` die neue Subdomain im Portal verlinken
4. `bun run deploy`

Das bestehende Wildcard-Zertifikat deckt die neue Subdomain automatisch ab — kein Zertifikats-Update nötig.

## Design System (Harthof)

Die Harthof-Seite verwendet das Quartiersrat Harthof Design System:

- **Farben:** LHM-Blau (`#0071b5`), angelehnt an muenchen.de
- **Schrift:** Open Sans (Google Fonts), Material Symbols Rounded (Icons)
- **Komponenten:** Button, Card, Alert, TeaserCard, EventCard, InfoBox, Tag — als plain HTML/CSS implementiert, keine Runtime-Abhängigkeiten
- **Tokens:** alle CSS-Variablen in `styles.css` definiert

Design-Vorlage: `Harthof Quartiersrat Landing Page.zip` (ASCEND / STUDIO | STADT | REGION)
