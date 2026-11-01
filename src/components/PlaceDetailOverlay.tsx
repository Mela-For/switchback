import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Image, ScrollView, Pressable, Linking, ActivityIndicator, TextInput, Platform, KeyboardAvoidingView } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { TripPlace } from '../types';
import { PLACE_CATEGORIES, placeCategoryIcon } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { googleMapsUrl, googleMapsDirectionsUrl, getPlaceDetails, type PlaceReview } from '../utils/placesApi';
import { GOOGLE_PLACES_API_KEY } from '../config/googlePlaces';
import { openExternalUrl } from '../utils/safeUrl';
import { Button, Dialog, Icon, IconButton, Tag, type IconName } from './ui';

interface Props {
  place: TripPlace;
  onClose: () => void;
  /** Omit to hide the Remove button (e.g. a read-only context like the trip map). */
  onRemove?: () => void;
  onSaveNotes: (notes: string) => void;
  mapExpanded: boolean;
  onExpandMap: () => void;
  onCollapseMap: () => void;
}

/**
 * Full-screen "place detail" view for a saved TripPlace: photo, rating, address, editable
 * notes, an expandable map, and Google reviews fetched live (the saved place only carries
 * the basic fields captured when it was added). Shared between TripDetailScreen's Places
 * tab and TripMapScreen's map callouts so both open the same page.
 */
export default function PlaceDetailOverlay({ place, onClose, onRemove, onSaveNotes, mapExpanded, onExpandMap, onCollapseMap }: Props) {
  const [placeReviews, setPlaceReviews] = useState<PlaceReview[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [editNotesVisible, setEditNotesVisible] = useState(false);
  const [draftNotes, setDraftNotes] = useState('');

  const isRecGovPlace = Boolean(place.recreationGov);

  useEffect(() => {
    // recreation.gov places carry a synthetic `recgov_<facilityId>` placeId, not a real Google
    // Place ID — skip the Google Places lookup rather than burning API quota on a call that
    // can only fail.
    if (isRecGovPlace) {
      setPlaceReviews(null);
      return;
    }
    let cancelled = false;
    setPlaceReviews(null);
    setLoading(true);
    getPlaceDetails(place.placeId, GOOGLE_PLACES_API_KEY)
      .then((details) => {
        if (!cancelled) setPlaceReviews(details.reviews ?? []);
      })
      .catch(() => {
        // Keep the basic info already shown from the saved place if the detail fetch fails
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [place.placeId, isRecGovPlace]);

  const openNotesModal = () => {
    setDraftNotes(place.notes ?? '');
    setEditNotesVisible(true);
  };

  const handleSaveNotes = () => {
    onSaveNotes(draftNotes.trim());
    setEditNotesVisible(false);
  };

  return (
    <>
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>{place.name}</Text>
          <IconButton icon="x" label="Close" variant="ghost" size="sm" onPress={onClose} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {place.photoUrl ? (
            <Image source={{ uri: place.photoUrl }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Icon name={placeCategoryIcon(place.category) as IconName} size={40} color={colors.forest500} />
            </View>
          )}
          <View style={styles.info}>
            <Text style={styles.name}>{place.name}</Text>
            <View style={styles.metaRow}>
              <Icon name={placeCategoryIcon(place.category) as IconName} size={14} color={colors.textSecondary} />
              <Text style={styles.category}>
                {PLACE_CATEGORIES.find((c) => c.value === place.category)?.label ?? place.category}
              </Text>
            </View>
            {place.rating != null && (
              <View style={styles.metaRow}>
                <Icon name="star" size={14} color={colors.gold500} />
                <Text style={styles.rating}>
                  {place.rating.toFixed(1)}
                  {place.userRatingsTotal != null ? ` (${place.userRatingsTotal.toLocaleString()} reviews)` : ''}
                </Text>
              </View>
            )}
            <Text style={styles.address}>{place.address}</Text>

            {place.recreationGov && (
              <View style={styles.recGovSection}>
                {place.recreationGov.description ? (
                  <Text style={styles.recGovDescription}>{place.recreationGov.description}</Text>
                ) : null}
                {place.recreationGov.activities && place.recreationGov.activities.length > 0 && (
                  <View style={styles.recGovTagRow}>
                    {place.recreationGov.activities.map((activity) => (
                      <Tag key={activity}>{activity}</Tag>
                    ))}
                  </View>
                )}
                {place.recreationGov.feeDescription ? (
                  <View style={styles.metaRow}>
                    <Icon name="ticket" size={14} color={colors.textSecondary} />
                    <Text style={styles.recGovFactText}>{place.recreationGov.feeDescription}</Text>
                  </View>
                ) : null}
                {place.recreationGov.stayLimit ? (
                  <View style={styles.metaRow}>
                    <Icon name="calendar" size={14} color={colors.textSecondary} />
                    <Text style={styles.recGovFactText}>Stay limit: {place.recreationGov.stayLimit}</Text>
                  </View>
                ) : null}
                {place.recreationGov.adaAccess ? (
                  <View style={styles.metaRow}>
                    <Icon name="accessibility" size={14} color={colors.textSecondary} />
                    <Text style={styles.recGovFactText}>ADA access: {place.recreationGov.adaAccess}</Text>
                  </View>
                ) : null}
                {place.recreationGov.phone ? (
                  <View style={styles.metaRow}>
                    <Icon name="phone" size={14} color={colors.textSecondary} />
                    <Text style={styles.recGovFactText}>{place.recreationGov.phone}</Text>
                  </View>
                ) : null}
                {place.recreationGov.directions ? (
                  <View style={styles.metaRow}>
                    <Icon name="navigation" size={14} color={colors.textSecondary} />
                    <Text style={styles.recGovFactText}>{place.recreationGov.directions}</Text>
                  </View>
                ) : null}
              </View>
            )}

            <Pressable style={styles.notesRow} onPress={openNotesModal}>
              <Icon name="pen" size={14} color={colors.textSecondary} />
              {place.notes ? (
                <Text style={styles.notesText}>{place.notes}</Text>
              ) : (
                <Text style={styles.notesPlaceholder}>Add notes</Text>
              )}
            </Pressable>
          </View>

          <Pressable style={styles.map} onPress={onExpandMap}>
            <MapView
              style={styles.mapView}
              scrollEnabled={false}
              zoomEnabled={false}
              pointerEvents="none"
              initialRegion={{
                latitude: place.lat,
                longitude: place.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            >
              <Marker coordinate={{ latitude: place.lat, longitude: place.lng }} title={place.name} />
            </MapView>
            <View style={styles.mapExpandBadge}>
              <Icon name="maximize" size={14} color={colors.cream50} />
              <Text style={styles.mapExpandText}>Expand</Text>
            </View>
          </Pressable>

          {loading && <ActivityIndicator color={colors.primary} style={styles.loader} />}

          {placeReviews && placeReviews.length > 0 && (
            <View style={styles.reviews}>
              <Text style={styles.reviewsTitle}>Reviews</Text>
              {placeReviews.slice(0, 5).map((review, i) => (
                <View key={i} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewAuthor} numberOfLines={1}>{review.author_name}</Text>
                    <Text style={styles.reviewTime}>{review.relative_time_description}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Icon name="star" size={12} color={colors.gold500} />
                    <Text style={styles.rating}>{review.rating.toFixed(1)}</Text>
                  </View>
                  {review.text ? <Text style={styles.reviewText}>{review.text}</Text> : null}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        <View style={styles.actions}>
          {place.recreationGov && (
            <Button
              icon="external-link"
              style={styles.actionBtn}
              onPress={() =>
                openExternalUrl(place.recreationGov?.reservationUrl ?? place.recreationGov?.sourceUrl)
              }
            >
              {place.recreationGov.reservable ? 'Reserve' : 'Recreation.gov'}
            </Button>
          )}
          <Button
            icon="map"
            style={styles.actionBtn}
            onPress={() =>
              Linking.openURL(
                place.recreationGov ? googleMapsDirectionsUrl(place.lat, place.lng) : googleMapsUrl(place.placeId)
              )
            }
          >
            {place.recreationGov ? 'Directions' : 'Open in Maps'}
          </Button>
          {onRemove && (
            <Button icon="trash-2" variant="secondary" style={styles.actionBtn} onPress={onRemove}>
              Remove
            </Button>
          )}
        </View>
      </View>

      {mapExpanded && (
        <View style={styles.fullMapOverlay}>
          <MapView
            style={styles.fullMapView}
            initialRegion={{
              latitude: place.lat,
              longitude: place.lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
          >
            <Marker coordinate={{ latitude: place.lat, longitude: place.lng }} title={place.name} />
          </MapView>
          <IconButton icon="x" label="Close" variant="default" style={styles.fullMapClose} onPress={onCollapseMap} />
        </View>
      )}

      <Dialog
        open={editNotesVisible}
        title="Edit notes"
        onClose={() => setEditNotesVisible(false)}
        footer={<Button onPress={handleSaveNotes}>Save</Button>}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TextInput
            style={styles.notesInput}
            value={draftNotes}
            onChangeText={setDraftNotes}
            placeholder="Reservation info, parking tips, hours..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
          />
        </KeyboardAvoidingView>
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfacePage,
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.space3,
    paddingTop: spacing.space3,
    paddingBottom: spacing.space2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    flex: 1,
    ...typography.titleMd,
    color: colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: spacing.space2,
  },
  content: {
    paddingBottom: spacing.space7,
  },
  photo: {
    width: '100%',
    height: 220,
  },
  photoPlaceholder: {
    backgroundColor: colors.forest100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    padding: spacing.space5,
    gap: 6,
  },
  name: {
    ...typography.displayMd,
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  category: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  rating: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.brown800,
  },
  address: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  recGovSection: {
    gap: 6,
    marginTop: spacing.space2,
  },
  recGovDescription: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  recGovTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space2,
    marginBottom: 2,
  },
  recGovFactText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  notesText: {
    ...typography.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },
  notesPlaceholder: {
    ...typography.bodySm,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  notesInput: {
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.sm,
    padding: spacing.space3,
    fontFamily: fontFamily.body,
    fontSize: typography.bodyMd.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceApp,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  map: {
    marginHorizontal: spacing.space5,
    height: 160,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  mapView: {
    flex: 1,
  },
  mapExpandBadge: {
    position: 'absolute',
    top: spacing.space3,
    right: spacing.space3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceOverlay,
    paddingHorizontal: spacing.space3,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  mapExpandText: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.cream50,
  },
  loader: {
    margin: spacing.space5,
  },
  reviews: {
    padding: spacing.space5,
  },
  reviewsTitle: {
    ...typography.titleMd,
    color: colors.textPrimary,
    marginBottom: spacing.space3,
  },
  reviewCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.space4,
    marginBottom: spacing.space3,
    gap: 6,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.space2,
  },
  reviewAuthor: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
    flex: 1,
  },
  reviewTime: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  reviewText: {
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.space3,
    padding: spacing.space4,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfacePage,
  },
  actionBtn: {
    flex: 1,
  },

  // Full-screen map
  fullMapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceSunken,
    zIndex: 200,
  },
  fullMapView: {
    flex: 1,
  },
  fullMapClose: {
    position: 'absolute',
    top: spacing.space3,
    right: spacing.space5,
  },
});
