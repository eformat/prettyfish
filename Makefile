IMAGE_REGISTRY ?= quay.io
IMAGE_REPOSITORY ?= eformat
IMAGE_NAME ?= prettyfish
IMAGE_TAG ?= latest
IMAGE ?= $(IMAGE_REGISTRY)/$(IMAGE_REPOSITORY)/$(IMAGE_NAME):$(IMAGE_TAG)
RELAY_IMAGE ?= $(IMAGE_REGISTRY)/$(IMAGE_REPOSITORY)/$(IMAGE_NAME)-relay:$(IMAGE_TAG)
CONTAINER_ENGINE ?= podman

.PHONY: build build-relay push push-relay run stop clean

build:
	$(CONTAINER_ENGINE) build -t $(IMAGE) -f Containerfile .

build-relay:
	$(CONTAINER_ENGINE) build -t $(RELAY_IMAGE) -f relay/Containerfile relay/

build-all: build build-relay

push: build
	$(CONTAINER_ENGINE) push $(IMAGE)

push-relay: build-relay
	$(CONTAINER_ENGINE) push $(RELAY_IMAGE)

push-all: push push-relay

run: stop-relay stop
	$(CONTAINER_ENGINE) network create prettyfish-net 2>/dev/null || true
	$(CONTAINER_ENGINE) run -d --name $(IMAGE_NAME)-relay --network prettyfish-net $(RELAY_IMAGE)
	$(CONTAINER_ENGINE) run -d --name $(IMAGE_NAME) --network prettyfish-net -p 8080:8080 -e RELAY_SERVICE_HOST=$(IMAGE_NAME)-relay $(IMAGE)

stop:
	-$(CONTAINER_ENGINE) stop $(IMAGE_NAME) 2>/dev/null
	-$(CONTAINER_ENGINE) rm $(IMAGE_NAME) 2>/dev/null

stop-relay:
	-$(CONTAINER_ENGINE) stop $(IMAGE_NAME)-relay 2>/dev/null
	-$(CONTAINER_ENGINE) rm $(IMAGE_NAME)-relay 2>/dev/null

clean: stop stop-relay
	-$(CONTAINER_ENGINE) rmi $(IMAGE) 2>/dev/null
	-$(CONTAINER_ENGINE) rmi $(RELAY_IMAGE) 2>/dev/null
	-$(CONTAINER_ENGINE) network rm prettyfish-net 2>/dev/null
